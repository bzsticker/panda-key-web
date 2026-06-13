// src/app/api/uploads/create-url/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';
import { getPresignedPutUrl } from '@/lib/r2-presign';

export const runtime = 'edge';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
const ALLOWED_EXTS = ['mp3', 'wav', 'flac', 'm4a'];
const MAX_SIZE = 150 * 1024 * 1024; // 150MB

export async function POST(request: Request) {
  try {
    const env = getCloudflareEnv();

    // Check if the caller is the Python worker via Authorization Header
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    let isWorker = false;
    let userId = '';

    if (token === env.API_SECRET) {
      isWorker = true;
    }

    const body = (await request.json()) as any;
    const { fileName, fileSize, fileType, existingTrackId } = body;

    if (isWorker) {
      // Worker must provide the userId to scope the upload properly
      userId = body.userId;
      if (!userId) {
        return NextResponse.json({ error: 'Missing userId in worker request' }, { status: 400 });
      }
    } else {
      const user = await getUserFromRequest(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    if (!fileName || !fileSize || !fileType) {
      return NextResponse.json({ error: 'Missing file metadata' }, { status: 400 });
    }

    // Validate size
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum limit of 150MB' }, { status: 400 });
    }

    // Validate type / extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTS.includes(ext)) {
      return NextResponse.json({ error: 'Unsupported file type. Supported types: mp3, wav, flac, m4a' }, { status: 400 });
    }

    const db = env.DB;
    let trackId = '';
    let r2Key = '';

    if (existingTrackId) {
      // Look up existing track
      const existingTrack = await db
        .prepare('SELECT id, r2_key FROM tracks WHERE id = ?' + (isWorker ? '' : ' AND user_id = ?'))
        .bind(existingTrackId, ...(isWorker ? [] : [userId]))
        .first<{ id: string; r2_key: string }>();

      if (!existingTrack) {
        return NextResponse.json({ error: 'Existing track not found or access denied' }, { status: 404 });
      }

      trackId = existingTrack.id;
      r2Key = existingTrack.r2_key;
    } else {
      trackId = `track-${crypto.randomUUID()}`;
      r2Key = `users/${userId}/tracks/${trackId}/original.${ext}`;

      // Insert track record in D1 as pending
      await db
        .prepare(
          `INSERT INTO tracks (
            id, user_id, file_name, r2_key, file_size, file_type, 
            title, artist, album, genre, year, comments, 
            musical_key, camelot_key, bpm, energy, duration, analysis_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          trackId,
          userId,
          fileName,
          r2Key,
          fileSize,
          fileType,
          fileName.replace(/\.[^/.]+$/, ''), // default title
          'Unknown Artist', // default artist
          'Unknown Album', // default album
          'Unknown Genre', // default genre
          new Date().getFullYear(), // default year
          '', // default comments
          '--', // musical key
          '--', // camelot key
          0, // bpm
          0, // energy
          0, // duration
          'pending'
        )
        .run();
    }

    // Generate presigned PUT URL if credentials are configured
    const hasS3Config = !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET_NAME);
    let presignedUrl = '';
    
    if (hasS3Config) {
      try {
        presignedUrl = await getPresignedPutUrl({
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          endpoint: env.R2_ENDPOINT,
          bucketName: env.R2_BUCKET_NAME,
          key: r2Key,
          expiresIn: 3600
        });
      } catch (err) {
        console.warn('Failed to generate presigned URL, will use fallback upload:', err);
      }
    } else {
      console.log('S3 credentials for R2 not configured. Falling back to native bucket binding upload.');
    }

    return NextResponse.json({
      trackId,
      r2Key,
      uploadUrl: presignedUrl,
      useFallbackUpload: !presignedUrl
    }, { status: 200 });

  } catch (error: any) {
    console.error('Create R2 upload URL error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
