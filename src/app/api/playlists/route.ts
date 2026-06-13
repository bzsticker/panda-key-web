// src/app/api/playlists/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/playlists - List all user playlists
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;

    // Fetch playlists along with track counts and track IDs
    const playlists = await db
      .prepare(
        `SELECT p.*, COUNT(pt.track_id) as track_count 
         FROM playlists p 
         LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id 
         WHERE p.user_id = ? 
         GROUP BY p.id 
         ORDER BY p.created_at DESC`
      )
      .bind(user.id)
      .all<any>();

    // For each playlist, also fetch its track IDs in order
    const result = [];
    for (const p of playlists.results) {
      const trackIdsResult = await db
        .prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC')
        .bind(p.id)
        .all<{ track_id: string }>();

      result.push({
        id: p.id,
        name: p.name,
        description: p.description,
        trackIds: trackIdsResult.results.map((r: { track_id: string }) => r.track_id),
        trackCount: p.track_count,
        totalTime: '00:00' // Frontend will compute or update this
      });
    }

    const response = NextResponse.json(result, { status: 200 });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;

  } catch (error: any) {
    console.error('List playlists error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST /api/playlists - Create a new playlist
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, type } = (await request.json()) as any;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;
    const prefix = type === 'collection' ? 'collection' : 'playlist';
    const playlistId = `${prefix}-${crypto.randomUUID()}`;

    await db
      .prepare('INSERT INTO playlists (id, user_id, name, description) VALUES (?, ?, ?, ?)')
      .bind(playlistId, user.id, name, description || '')
      .run();

    return NextResponse.json({
      id: playlistId,
      name,
      description: description || '',
      trackIds: [],
      trackCount: 0,
      totalTime: '00:00'
    }, { status: 201 });

  } catch (error: any) {
    console.error('Create playlist error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
