// src/lib/cloudflare.ts
import { getRequestContext } from '@cloudflare/next-on-pages';

export interface CloudflareEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
  QUEUE: Queue<any>;
  API_SECRET: string;
  PYTHON_WORKER_URL?: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  R2_BUCKET_NAME: string;
}

export function getCloudflareEnv(): CloudflareEnv {
  try {
    const ctx = getRequestContext();
    console.log('[getCloudflareEnv] ctx:', {
      hasCtx: !!ctx,
      hasEnv: !!ctx?.env,
      envKeys: ctx?.env ? Object.keys(ctx.env) : [],
      DB: !!(ctx?.env as any)?.DB,
    });
    if (!ctx || !ctx.env) {
      throw new Error('No Cloudflare request context or env available');
    }
    return ctx.env as unknown as CloudflareEnv;
  } catch (error: any) {
    console.warn('[getCloudflareEnv] Error or fallback in getCloudflareEnv:', error.message || error);
    // Fallback to process.env in environments where request context is not available
    // (e.g. standard next dev if not proxying, or build scripts)
    const env = process.env as unknown as Record<string, any>;
    return {
      DB: env.DB as D1Database,
      BUCKET: env.BUCKET as R2Bucket,
      QUEUE: env.QUEUE as Queue<any>,
      API_SECRET: env.API_SECRET || 'pandakey_super_secret_token_123!',
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || 'local_access_key',
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || 'local_secret_key',
      R2_ENDPOINT: env.R2_ENDPOINT || 'http://127.0.0.1:8787',
      R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'pandakey-r2'
    } as CloudflareEnv;
  }
}

