// src/app/api/tracks/[id]/cover/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// Premium Vinyl Placeholder SVG
const DEFAULT_COVER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="100%" stop-color="#070a14" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00bfff" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#00bfff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <!-- Background -->
  <rect width="300" height="300" fill="url(#bgGrad)" />
  <!-- Glow effect -->
  <circle cx="150" cy="150" r="120" fill="url(#glow)" />
  <!-- Vinyl Record Outer Ring -->
  <circle cx="150" cy="150" r="90" fill="none" stroke="#121829" stroke-width="6" />
  <circle cx="150" cy="150" r="80" fill="none" stroke="#1a233d" stroke-width="1" />
  <circle cx="150" cy="150" r="70" fill="none" stroke="#1a233d" stroke-width="1" />
  <circle cx="150" cy="150" r="60" fill="none" stroke="#1a233d" stroke-width="1" stroke-dasharray="8,8" />
  <circle cx="150" cy="150" r="50" fill="none" stroke="#1a233d" stroke-width="1" />
  <!-- Vinyl Center Label -->
  <circle cx="150" cy="150" r="30" fill="#0d1527" stroke="#00bfff" stroke-width="2" />
  <!-- Center Spindle Hole -->
  <circle cx="150" cy="150" r="6" fill="#050811" />
  <!-- Music Icon -->
  <path d="M145 135 v30 a10 10 0 1 1 -10 -10 c5 0 10 2 10 5 v-25 h20 v15 a10 10 0 1 1 -10 -10 c5 0 10 2 10 5 v-15 z" fill="#00bfff" opacity="0.85" />
</svg>
`.trim();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const env = getCloudflareEnv();
    const { id: trackId } = await params;
    const db = env.DB;
    const bucket = env.BUCKET;

    if (!bucket) {
      return NextResponse.json({ error: 'R2 bucket not bound' }, { status: 500 });
    }

    // 1. Authorize user
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch track info from D1 to get user_id (checking ownership)
    const track = await db
      .prepare('SELECT user_id FROM tracks WHERE id = ?')
      .bind(trackId)
      .first<{ user_id: string }>();

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    // 3. Try to get cover from R2
    const coverR2Key = `users/${track.user_id}/tracks/${trackId}/cover.jpg`;
    const object = await bucket.get(coverR2Key);

    if (!object) {
      // Return beautiful default vector placeholder SVG
      const headers = new Headers();
      headers.set('Content-Type', 'image/svg+xml');
      headers.set('Cache-Control', 'public, max-age=86400'); // Cache placeholder for 1 day
      return new Response(DEFAULT_COVER_SVG, {
        status: 200,
        headers
      });
    }

    // 4. Return the image response
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Content-Length', object.size.toString());
    headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // Cache original cover aggressively

    return new Response(object.body, {
      status: 200,
      headers
    });

  } catch (error: any) {
    console.error('Cover art GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
