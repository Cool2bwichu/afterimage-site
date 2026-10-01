// The claude.ai Artifact build: AFTERIMAGE's private routes are answered here,
// inside the page, by asking Claude through the Artifact's `sample` capability
// on the viewer's own Claude account. Imported before the app, so app/lib/api.ts
// finds it when it loads.
import { createInPageCompanion } from '../companion/lib/in-page-companion.mjs';

const capability = (name) => (typeof globalThis.claude?.use === 'function' ? globalThis.claude.use(name) : null);

globalThis.__AFTERIMAGE_IN_PAGE_API__ = createInPageCompanion({ getSample: () => capability('sample') });

// A page in an Artifact cannot start a download; the viewer's save dialog can.
globalThis.__AFTERIMAGE_SAVE_FILE__ = async (filename, data) => {
  const downloads = await capability('downloads');
  if (!downloads) throw new Error('Saving files is not available here.');
  return downloads.save({ filename, data });
};
