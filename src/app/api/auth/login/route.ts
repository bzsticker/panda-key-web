// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { verifyPassword, signToken } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as any;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;

    // Retrieve user from D1
    const user = await db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first<{ id: string; email: string; password_hash: string }>();

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Sign session token
    const token = await signToken(user.id, user.email);

    // Create session cookie
    const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 200 });
    response.headers.set(
      'Set-Cookie',
      `pandakey_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
