'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/registro', label: 'Día', icon: '🚕' },
  { href: '/gastos', label: 'Gastos', icon: '⛽' },
  { href: '/informes', label: 'Cuadre', icon: '📊' },
  { href: '/configuracion', label: 'Ajustes', icon: '⚙️' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                  active ? 'text-amber' : 'text-muted'
                }`}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className={active ? 'font-semibold' : ''}>{tab.label}</span>
                <span
                  className={`mt-0.5 h-0.5 w-6 rounded-full transition-opacity ${
                    active ? 'bg-amber opacity-100' : 'opacity-0'
                  }`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
