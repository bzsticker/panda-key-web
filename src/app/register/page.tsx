// src/app/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as any;

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      router.push('/app/collection');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-md p-8 rounded-2xl border bg-opacity-75 backdrop-blur-md shadow-2xl flex flex-col items-center" 
           style={{ 
             backgroundColor: 'var(--panel-bg-solid)', 
             borderColor: 'var(--panel-border)' 
           }}>
        
        {/* Logo */}
        <div className="mb-6 w-full flex justify-center">
          <img 
            src="/logo.png" 
            style={{ 
              width: '100%', 
              maxWidth: '240px', 
              height: 'auto', 
              maxHeight: '90px', 
              objectFit: 'contain'
            }} 
            alt="PandaKey Logo" 
          />
        </div>

        {error && (
          <div className="w-full p-3 rounded-lg border text-sm text-center mb-4" 
               style={{ 
                 backgroundColor: 'rgba(255, 80, 116, 0.1)', 
                 borderColor: 'var(--accent-red)', 
                 color: 'var(--accent-red)' 
               }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dj-panda@pandakey.dj"
              className="w-full px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none"
              style={{
                backgroundColor: 'rgba(13, 22, 33, 0.6)',
                borderColor: 'var(--panel-border)',
                color: 'var(--text-main)'
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none"
              style={{
                backgroundColor: 'rgba(13, 22, 33, 0.6)',
                borderColor: 'var(--panel-border)',
                color: 'var(--text-main)'
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none"
              style={{
                backgroundColor: 'rgba(13, 22, 33, 0.6)',
                borderColor: 'var(--panel-border)',
                color: 'var(--text-main)'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-bold transition-all transform hover:-translate-y-0.5 active:translate-y-0 mt-2"
            style={{
              background: 'linear-gradient(135deg, var(--accent-neon), var(--accent-cyan))',
              color: '#fff',
              boxShadow: '0 0 15px rgba(0, 152, 255, 0.4)'
            }}
          >
            {loading ? 'Creating Account...' : 'REGISTER'}
          </button>
        </form>

        <div className="mt-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold transition-colors hover:underline" style={{ color: 'var(--accent-cyan)' }}>
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}
