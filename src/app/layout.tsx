import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

const body = Figtree({
  subsets: ['latin'],
  variable: '--font-body',
});

const meter = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-meter',
  weight: ['500', '600'],
});

export const metadata: Metadata = {
  title: 'TaxiLog',
  description: 'Control de ingresos, gastos y cuadre con el jefe',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TaxiLog',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0c0e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // evita zoom accidental al tocar inputs en iOS
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${body.variable} ${meter.variable}`}>
        {children}
      </body>
    </html>
  );
}
