'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setError(
        error.message.includes('already registered')
          ? 'Ese correo ya tiene cuenta. Prueba a entrar.'
          : 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.',
      );
      setLoading(false);
      return;
    }
    // El acuerdo con el jefe es lo primero que necesita configurar.
    router.replace('/configuracion?bienvenida=1');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rise-in">
        <div className="checker mb-6 rounded-full" />
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold">
          Crea tu cuenta
        </h1>
        <p className="mt-1 text-muted">Gratis durante 30 días. Sin tarjeta.</p>
      </div>

      <form onSubmit={handleRegister} className="card rise-in-2 flex flex-col gap-4 p-6">
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Tu nombre
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="amount-input px-4 py-3 text-base text-foreground"
          />
        </label>

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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="amount-input px-4 py-3 text-base text-foreground"
          />
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}

        <button type="submit" disabled={loading} className="btn-amber py-3.5 text-base">
          {loading ? 'Creando cuenta…' : 'Empezar'}
        </button>
      </form>

      <p className="rise-in-3 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-amber">
          Entra aquí
        </Link>
      </p>
    </main>
  );
}
