import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AFTERIMAGE — Your cinematic sensibility',
    short_name: 'AFTERIMAGE',
    description: 'A private cinematic instrument, programmed by Claude.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0D14',
    theme_color: '#0B0D14',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
