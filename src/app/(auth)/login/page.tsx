'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Correo o contraseña incorrectos. Revísalos e inténtalo de nuevo.');
      setLoading(false);
      return;
    }
    router.replace('/registro');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rise-in">
        <div className="checker mb-6 rounded-full" />
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold">
          Taxi<span className="text-amber">Log</span>
        </h1>
        <p className="mt-1 text-muted">Tu jornada, clara y al céntimo.</p>
      </div>

      <form onSubmit={handleLogin} className="card rise-in-2 flex flex-col gap-4 p-6">
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Correo
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="amount-input px-4 py-3 text-base text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="amount-input px-4 py-3 text-base text-foreground"
          />
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}

        <button type="submit" disabled={loading} className="btn-amber py-3.5 text-base">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="rise-in-3 text-center text-sm text-muted">
        ¿Primera vez?{' '}
        <Link href="/register" className="font-semibold text-amber">
          Crea tu cuenta
        </Link>
      </p>
    </main>
  );
}
