// src/app/api/tracks/[id]/audio/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authorize user (or allow Python worker using Bearer token for analysis download)
    const env = getCloudflareEnv();
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    let userId = '';
    let isWorker = false;

    if (token && token === env.API_SECRET) {
      isWorker = true;
    } else {
      const user = await getUserFromRequest(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    const { id: trackId } = await params;
    const db = env.DB;
    const bucket = env.BUCKET;

    // 2. Fetch track info from D1
    const track = isWorker
      ? await db.prepare('SELECT r2_key, file_type FROM tracks WHERE id = ?').bind(trackId).first<{ r2_key: string; file_type: string }>()
      : await db.prepare('SELECT r2_key, file_type FROM tracks WHERE id = ? AND user_id = ?').bind(trackId, userId).first<{ r2_key: string; file_type: string }>();

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    if (!bucket) {
      return NextResponse.json({ error: 'R2 bucket not bound' }, { status: 500 });
    }

    // 3. Retrieve object from R2
    const object = await bucket.get(track.r2_key);
    if (!object) {
      return NextResponse.json({ error: 'Audio file not found in storage' }, { status: 404 });
    }

    // 4. Return as streaming response with correct content-type
    const headers = new Headers();
    headers.set('Content-Type', track.file_type || 'audio/mpeg');
    headers.set('Content-Length', object.size.toString());
    headers.set('Accept-Ranges', 'bytes');
    
    return new Response(object.body, {
      status: 200,
      headers
    });

  } catch (error: any) {
    console.error('Audio stream error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
