import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from './bottom-nav';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur">
        <div className="checker" />
        <div className="flex items-center justify-between px-5 py-3">
          <span className="font-[family-name:var(--font-display)] text-lg font-extrabold">
            Taxi<span className="text-amber">Log</span>
          </span>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">{children}</main>

      <BottomNav />
    </div>
  );
}
