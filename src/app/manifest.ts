import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TaxiLog',
    short_name: 'TaxiLog',
    description: 'Control de ingresos, gastos y cuadre con el jefe',
    lang: 'es',
    start_url: '/registro',
    display: 'standalone',
    background_color: '#0b0c0e',
    theme_color: '#0b0c0e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
