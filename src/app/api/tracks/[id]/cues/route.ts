// src/app/api/tracks/[id]/cues/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/tracks/:id/cues - Fetch all cue points for the given track
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

    // Verify user owns the track
    const track = await db
      .prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?')
      .bind(trackId, user.id)
      .first();

    if (!track) {
      return NextResponse.json({ error: 'Track not found or access denied' }, { status: 404 });
    }

    // Retrieve cue points
    const { results } = await db
      .prepare('SELECT * FROM cue_points WHERE track_id = ? ORDER BY time ASC')
      .bind(trackId)
      .all();

    const mapped = (results || []).map((row: any) => {
      const cleanId = row.id.includes('_') ? row.id.split('_').pop() : row.id;
      return {
        ...row,
        id: cleanId
      };
    });

    return NextResponse.json(mapped, { status: 200 });

  } catch (error: any) {
    console.error('Fetch cues error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tracks/:id/cues - Sync (overwrite) all cue points for the given track
export async function POST(
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

    // Verify user owns the track
    const track = await db
      .prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?')
      .bind(trackId, user.id)
      .first();

    if (!track) {
      return NextResponse.json({ error: 'Track not found or access denied' }, { status: 404 });
    }

    const body = await request.json() as { cues: Array<{ id: string; time: number; label?: string; color?: string }> };
    const cues = body.cues || [];

    // Delete existing cues for the track
    await db.prepare('DELETE FROM cue_points WHERE track_id = ?').bind(trackId).run();

    if (cues.length > 0) {
      // Create batch insert statements
      const stmts = cues.map(cue => {
        const dbCueId = `${trackId}_${cue.id}`;
        return db.prepare('INSERT INTO cue_points (id, track_id, time, label, color) VALUES (?, ?, ?, ?, ?)')
          .bind(dbCueId, trackId, cue.time, cue.label || '', cue.color || '');
      });
      
      // Execute in batch
      await db.batch(stmts);
    }

    return NextResponse.json({ success: true, count: cues.length }, { status: 200 });

  } catch (error: any) {
    console.error('Sync cues error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
