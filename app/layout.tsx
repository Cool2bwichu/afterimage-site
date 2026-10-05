import type { Metadata, Viewport } from 'next';
import { Archivo, Big_Shoulders, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import './globals.css';
import './light-table.css';
import './atlas.css';
import './landing.css';
import './projection-room.css';
import './celestial.css';
import './collections.css';
import './observatory.css';
import './encounters.css';
import './palace.css';
import './rooms.css';
import { CelestialProvider } from './components/celestial';

// The picture palace's four voices: billing caps for titles, a reading serif for the
// notes and the usher, a plain grotesque for controls, and the booth's typewriter.
const billing = Big_Shoulders({
  variable: '--font-billing',
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
});

const display = Newsreader({
  variable: '--font-display',
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
});

const sans = Archivo({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN || 'http://localhost:3000'),
  title: 'AFTERIMAGE — Your cinematic sensibility',
  description: 'Discover films through the feelings, images and ideas you love. Find your next reel, blend qualities with the Light Table, and explore connections in Atlas.',
  applicationName: 'AFTERIMAGE',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AFTERIMAGE',
  },
  openGraph: {
    type: 'website',
    title: 'AFTERIMAGE — Your cinematic sensibility',
    description: 'Find your next film through the feelings, images and ideas that stay with you.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'AFTERIMAGE cinematic film projector artwork' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AFTERIMAGE — Your cinematic sensibility',
    description: 'Find your next reel, shape it with the Light Table, and follow the connections in Atlas.',
    images: ['/og.png'],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0c0a08',
  colorScheme: 'dark',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${billing.variable} ${display.variable} ${sans.variable} ${mono.variable}`}><CelestialProvider>{children}</CelestialProvider></body>
    </html>
  );
}
