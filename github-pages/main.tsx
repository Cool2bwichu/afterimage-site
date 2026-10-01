// The GitHub Pages build of AFTERIMAGE: the same page as app/layout.tsx and
// app/page.tsx, rendered in the browser with no server. Private calls go to the
// companion set at build time (see vite.pages.config.ts and app/lib/api.ts).
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import '../app/light-table.css';
import '../app/atlas.css';
import '../app/landing.css';
import '../app/projection-room.css';
import '../app/celestial.css';
import '../app/collections.css';
import '../app/observatory.css';
import '../app/encounters.css';
import './fonts.css';
import { CelestialProvider } from '../app/components/celestial';
import Home from '../app/page';

const root = document.getElementById('afterimage');
if (root) createRoot(root).render(<CelestialProvider><Home /></CelestialProvider>);
