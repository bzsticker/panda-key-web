// src/app/api/uploads/complete/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';
import { getPresignedPutUrl } from '@/lib/r2-presign';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trackId } = (await request.json()) as any;

    if (!trackId) {
      return NextResponse.json({ error: 'Missing trackId' }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;
    const queue = env.QUEUE;

    // Verify track exists and belongs to user
    const track = await db
      .prepare('SELECT id, file_name, r2_key FROM tracks WHERE id = ? AND user_id = ?')
      .bind(trackId, user.id)
      .first<{ id: string; file_name: string; r2_key: string }>();

    if (!track) {
      return NextResponse.json({ error: 'Track not found or access denied' }, { status: 404 });
    }

    const jobId = `job-${crypto.randomUUID()}`;

    // Create analysis job record in D1
    await db
      .prepare(
        `INSERT INTO analysis_jobs (
          id, track_id, user_id, status, progress, current_step, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(jobId, trackId, user.id, 'pending', 0, 'Waiting in queue...', '')
      .run();

    // Update track status to processing
    await db
      .prepare('UPDATE tracks SET analysis_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind('processing', trackId)
      .run();

    // Generate direct API download URL for the Python worker
    const origin = new URL(request.url).origin;
    const presignedDownloadUrl = `${origin}/api/tracks/${trackId}/audio`;

    const queueMessage = {
      type: 'analyze',
      track_id: trackId,
      job_id: jobId,
      user_id: user.id,
      r2_key: track.r2_key,
      file_name: track.file_name,
      download_url: presignedDownloadUrl
    };

    // Send message to Cloudflare Queue
    if (queue) {
      await queue.send(queueMessage);
      console.log(`[API] Enqueued track job for ${trackId} in queue.`);
    } else {
      console.warn('[API] Cloudflare Queue binding not available, skipping message send.');
    }

    // Local development fallback: directly invoke python worker since cross-process local queues can be unreliable
    const isLocalDev = origin.includes('localhost') || origin.includes('127.0.0.1');
    if (isLocalDev && env.PYTHON_WORKER_URL) {
      console.log(`[API Local Fallback] Directly invoking Python Worker at ${env.PYTHON_WORKER_URL}`);
      fetch(env.PYTHON_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queueMessage)
      }).catch(err => {
        console.error('[API Local Fallback Error] Failed to trigger Python worker:', err);
      });
    }

    return NextResponse.json({
      success: true,
      jobId,
      trackId,
      status: 'processing'
    }, { status: 200 });

  } catch (error: any) {
    console.error('Complete upload error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
