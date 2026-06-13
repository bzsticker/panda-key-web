// src/app/api/tracks/[id]/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/tracks/:id - Retrieve specific track details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: trackId } = await params;
    const env = getCloudflareEnv();
    const db = env.DB;

    const track = await db
      .prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?')
      .bind(trackId, user.id)
      .first();

    if (!track) {
      return NextResponse.json({ error: 'Track not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(track, { status: 200 });

  } catch (error: any) {
    console.error('Get track error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/tracks/:id - Update track metadata (User or Python worker)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const env = getCloudflareEnv();
    const { id: trackId } = await params;
    const db = env.DB;

    // Check if the caller is the Python worker via Authorization Header
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    let isWorker = false;
    let userId = '';

    if (token === env.API_SECRET) {
      isWorker = true;
    } else {
      const user = await getUserFromRequest(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    // Verify track exists (and verify user ownership if not worker)
    let track;
    if (isWorker) {
      track = await db.prepare('SELECT id, r2_key, user_id FROM tracks WHERE id = ?').bind(trackId).first<{ id: string; r2_key: string; user_id: string }>();
    } else {
      track = await db.prepare('SELECT id, r2_key, user_id FROM tracks WHERE id = ? AND user_id = ?').bind(trackId, userId).first<{ id: string; r2_key: string; user_id: string }>();
    }

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const body = (await request.json()) as any;

    // Fields that can be modified
    const allowedFields = [
      'title', 'artist', 'album', 'genre', 'year', 'comments', 
      'musical_key', 'camelot_key', 'bpm', 'energy', 'duration', 
      'analysis_status', 'r2_key'
    ];

    const sets = [];
    const binds = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        binds.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    binds.push(trackId);

    // Update in D1
    await db
      .prepare(`UPDATE tracks SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...binds)
      .run();

    // Process cover art upload to R2 if provided in the body
    const coverArtBase64 = body.cover_art_base64;
    if (coverArtBase64 && env.BUCKET) {
      try {
        const parts = coverArtBase64.split(';base64,');
        if (parts.length === 2) {
          const contentType = parts[0].replace('data:', '');
          const base64Data = parts[1];
          
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const coverR2Key = `users/${track.user_id}/tracks/${trackId}/cover.jpg`;
          await env.BUCKET.put(coverR2Key, bytes.buffer, {
            httpMetadata: { contentType: contentType || 'image/jpeg' }
          });
          console.log(`[R2] Successfully saved cover art to R2: ${coverR2Key}`);
        }
      } catch (coverErr) {
        console.error('Failed to upload cover art to R2:', coverErr);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Update track error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tracks/:id - Delete a track from R2 and D1
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: trackId } = await params;
    const env = getCloudflareEnv();
    const db = env.DB;
    const bucket = env.BUCKET;

    // Verify track belongs to user and get R2 key
    const track = await db
      .prepare('SELECT r2_key FROM tracks WHERE id = ? AND user_id = ?')
      .bind(trackId, user.id)
      .first<{ r2_key: string }>();

    if (!track) {
      return NextResponse.json({ error: 'Track not found or access denied' }, { status: 404 });
    }

    // 1. Delete from R2 bucket if binding exists
    if (bucket) {
      try {
        await bucket.delete(track.r2_key);
        console.log(`[R2] Deleted file from R2: ${track.r2_key}`);
      } catch (r2Err) {
        console.error(`[R2] Failed to delete file ${track.r2_key} from R2:`, r2Err);
      }
      try {
        const coverR2Key = `users/${user.id}/tracks/${trackId}/cover.jpg`;
        await bucket.delete(coverR2Key);
        console.log(`[R2] Deleted cover art from R2: ${coverR2Key}`);
      } catch (r2Err) {
        // Ignore errors if cover doesn't exist
      }
    }

    // 2. Delete track record from D1 (cascade delete will clean up playlist_tracks, cue_points, etc.)
    await db.prepare('DELETE FROM tracks WHERE id = ?').bind(trackId).run();

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Delete track error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
