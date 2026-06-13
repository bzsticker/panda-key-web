// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.headers.set(
    'Set-Cookie',
    'pandakey_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
  return response;
}
