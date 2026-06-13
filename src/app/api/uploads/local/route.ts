// src/app/api/uploads/local/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const env = getCloudflareEnv();
    const bucket = env.BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: 'R2 Bucket not bound' }, { status: 500 });
    }

    // Parse formData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const trackId = formData.get('trackId') as string;
    const r2Key = formData.get('r2Key') as string;

    if (!file || !trackId || !r2Key) {
      return NextResponse.json({ error: 'Missing file or upload metadata' }, { status: 400 });
    }

    // Write directly to local R2 bucket using binding
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type || 'audio/mpeg',
      }
    });

    console.log(`[API Local Upload] Successfully saved file to local R2: ${r2Key}`);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Local upload error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
