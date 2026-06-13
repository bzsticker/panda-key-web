// src/app/api/tracks/[id]/audio/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

function parseRangeHeader(rangeHeader: string, fileSize: number): { offset: number; length: number; start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startStr = match[1];
  const endStr = match[2];

  let start = 0;
  let end = fileSize - 1;

  if (startStr !== '') {
    start = parseInt(startStr, 10);
    if (endStr !== '') {
      end = parseInt(endStr, 10);
    }
  } else if (endStr !== '') {
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, fileSize - suffix);
  }

  if (start >= fileSize) return null;
  if (end >= fileSize) end = fileSize - 1;
  if (start > end) return null;

  return {
    offset: start,
    length: end - start + 1,
    start,
    end
  };
}

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

    // 3. Retrieve object metadata to get the total size
    const headObject = await bucket.head(track.r2_key);
    if (!headObject) {
      return NextResponse.json({ error: 'Audio file not found in storage' }, { status: 404 });
    }
    const fileSize = headObject.size;

    // 4. Parse Range header if present
    const rangeHeader = request.headers.get('Range');
    let getOptions = {};
    let isPartial = false;
    let start = 0;
    let end = fileSize - 1;

    if (rangeHeader) {
      const parsedRange = parseRangeHeader(rangeHeader, fileSize);
      if (parsedRange) {
        getOptions = {
          range: {
            offset: parsedRange.offset,
            length: parsedRange.length
          }
        };
        isPartial = true;
        start = parsedRange.start;
        end = parsedRange.end;
      }
    }

    // 5. Retrieve object from R2 (potentially partial)
    const object = await bucket.get(track.r2_key, getOptions);
    if (!object) {
      return NextResponse.json({ error: 'Audio file not found in storage' }, { status: 404 });
    }

    // 6. Return as streaming response with correct content-type
    const headers = new Headers();
    headers.set('Content-Type', track.file_type || 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    
    if (isPartial) {
      headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      headers.set('Content-Length', (end - start + 1).toString());
      return new Response(object.body, {
        status: 206,
        headers
      });
    } else {
      headers.set('Content-Length', fileSize.toString());
      return new Response(object.body, {
        status: 200,
        headers
      });
    }

  } catch (error: any) {
    console.error('Audio stream error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
