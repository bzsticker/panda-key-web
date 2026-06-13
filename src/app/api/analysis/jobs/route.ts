// src/app/api/analysis/jobs/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/analysis/jobs - List recent analysis jobs and queue status
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;

    // Fetch active or recent jobs joined with track info
    const jobs = await db
      .prepare(
        `SELECT aj.*, t.file_name 
         FROM analysis_jobs aj 
         JOIN tracks t ON aj.track_id = t.id 
         WHERE aj.user_id = ? 
         ORDER BY aj.created_at DESC`
      )
      .bind(user.id)
      .all<any>();

    const response = NextResponse.json(jobs.results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;

  } catch (error: any) {
    console.error('List analysis jobs error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
