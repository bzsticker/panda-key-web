// src/app/api/analysis/jobs/[id]/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';

export const runtime = 'edge';

// PATCH /api/analysis/jobs/:id - Secure endpoint for Python worker to update progress
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const env = getCloudflareEnv();
    const { id: jobId } = await params;

    // Validate Authorization Bearer Token
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token !== env.API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status, progress, current_step, error_message } = (await request.json()) as any;
    const db = env.DB;

    // Verify job exists
    const job = await db
      .prepare('SELECT id, track_id FROM analysis_jobs WHERE id = ?')
      .bind(jobId)
      .first<{ id: string; track_id: string }>();

    if (!job) {
      return NextResponse.json({ error: 'Analysis job not found' }, { status: 404 });
    }

    // Build update dynamic query
    const sets = [];
    const binds = [];

    if (status !== undefined) {
      sets.push('status = ?');
      binds.push(status);
    }
    if (progress !== undefined) {
      sets.push('progress = ?');
      binds.push(progress);
    }
    if (current_step !== undefined) {
      sets.push('current_step = ?');
      binds.push(current_step);
    }
    if (error_message !== undefined) {
      sets.push('error_message = ?');
      binds.push(error_message);
    }

    binds.push(jobId);

    if (sets.length > 0) {
      await db
        .prepare(`UPDATE analysis_jobs SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(...binds)
        .run();
    }

    // If job has failed or completed, sync the track analysis status accordingly
    if (status === 'completed' || status === 'failed') {
      const trackStatus = status === 'completed' ? 'completed' : 'failed';
      await db
        .prepare('UPDATE tracks SET analysis_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(trackStatus, job.track_id)
        .run();
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Update analysis job error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
