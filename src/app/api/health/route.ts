// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';

export const runtime = 'edge';

export async function GET() {
  const diagnostics: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Panda Key API',
    database: 'unknown',
    storage: 'unknown'
  };

  try {
    const env = getCloudflareEnv();
    
    // Test D1 connection
    if (env.DB) {
      try {
        await env.DB.prepare('SELECT 1').first();
        diagnostics.database = 'connected';
      } catch (dbErr: any) {
        diagnostics.status = 'error';
        diagnostics.database = `error: ${dbErr.message || dbErr}`;
      }
    } else {
      diagnostics.status = 'error';
      diagnostics.database = 'binding_missing';
    }

    // Test R2 binding
    if (env.BUCKET) {
      diagnostics.storage = 'bound';
    } else {
      diagnostics.status = 'error';
      diagnostics.storage = 'binding_missing';
    }
  } catch (err: any) {
    diagnostics.status = 'error';
    diagnostics.env_error = err.message || err;
  }

  const statusCode = diagnostics.status === 'ok' ? 200 : 500;
  return NextResponse.json(diagnostics, { status: statusCode });
}
