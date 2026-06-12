import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // En desarrollo el SW solo estorba (caché fantasma); solo activo en builds.
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
