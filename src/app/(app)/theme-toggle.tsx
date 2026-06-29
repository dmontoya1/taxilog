'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('taxilog-theme') as Theme | null;
    if (stored) {
      setTheme(stored);
    } else {
      setTheme('light');
    }
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('taxilog-theme', next);
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
      className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-opacity active:opacity-70"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
