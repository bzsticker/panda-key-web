// src/app/api/tracks/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/tracks - Retrieve all tracks for the logged-in user with filters
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.toLowerCase() || '';
    const genre = searchParams.get('genre') || '';
    const keyGroup = searchParams.get('keyGroup') || ''; // 'A' or 'B'
    const key = searchParams.get('key') || '';
    const sortBy = searchParams.get('sortBy') || 'id';
    const sortDesc = searchParams.get('sortDesc') === 'true';

    const env = getCloudflareEnv();
    const db = env.DB;

    // Build query dynamically
    let queryStr = 'SELECT * FROM tracks WHERE user_id = ?';
    const binds: any[] = [user.id];

    if (q) {
      queryStr += ' AND (LOWER(title) LIKE ? OR LOWER(artist) LIKE ? OR LOWER(album) LIKE ? OR LOWER(genre) LIKE ?)';
      const searchBind = `%${q}%`;
      binds.push(searchBind, searchBind, searchBind, searchBind);
    }

    if (genre) {
      queryStr += ' AND genre = ?';
      binds.push(genre);
    }

    if (key) {
      queryStr += ' AND camelot_key = ?';
      binds.push(key);
    } else if (keyGroup) {
      queryStr += ' AND camelot_key LIKE ?';
      binds.push(`%${keyGroup}`);
    }

    // Validate sort fields to prevent SQL injection
    const allowedSortFields = ['id', 'title', 'artist', 'album', 'genre', 'year', 'bpm', 'energy', 'duration', 'created_at'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'id';
    const sortOrder = sortDesc ? 'DESC' : 'ASC';

    queryStr += ` ORDER BY ${sortField} ${sortOrder}`;

    const tracks = await db.prepare(queryStr).bind(...binds).all();

    const response = NextResponse.json(tracks.results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;

  } catch (error: any) {
    console.error('List tracks error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
