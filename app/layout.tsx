import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './globals.css';
import './light-table.css';

const display = Cormorant_Garamond({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const sans = DM_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN || 'http://localhost:3000'),
  title: 'AFTERIMAGE — Your cinematic sensibility',
  description: 'A private cinematic instrument that develops your film taste into a persona, palette, spirit director, and five precise recommendations.',
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
    description: 'Develop your film taste into a cinematic persona, palette, spirit director, and five precise recommendations.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'AFTERIMAGE cinematic film projector artwork' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AFTERIMAGE — Your cinematic sensibility',
    description: 'A private cinematic instrument powered by your ChatGPT account.',
    images: ['/og.png'],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b100e',
  colorScheme: 'dark',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
