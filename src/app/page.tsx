// src/app/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';

export const runtime = 'edge';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('pandakey_session')?.value;
  const decoded = token ? await verifyToken(token) : null;

  if (decoded) {
    redirect('/app/collection');
  } else {
    redirect('/login');
  }
}
