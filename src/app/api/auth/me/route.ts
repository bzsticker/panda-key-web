// src/app/api/auth/me/route.ts
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user });
}
