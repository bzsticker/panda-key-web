// src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { getCloudflareEnv } from '@/lib/cloudflare';
import { hashPassword, signToken } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as any;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const db = env.DB;

    // Check if user already exists
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first<{ id: string }>();

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // Insert user into D1
    await db
      .prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(userId, email.toLowerCase(), passwordHash)
      .run();

    // Sign session token
    const token = await signToken(userId, email);

    // Create session cookie
    const response = NextResponse.json({ user: { id: userId, email } }, { status: 201 });
    response.headers.set(
      'Set-Cookie',
      `pandakey_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
