// Saves a file the page made. A browser takes a download link. Inside a
// claude.ai Artifact, where a page cannot start downloads itself,
// github-pages/in-page.mjs installs the viewer's own save dialog instead.
type SaveFile = (filename: string, data: Blob) => Promise<unknown>;

declare global {
  var __AFTERIMAGE_SAVE_FILE__: SaveFile | undefined;
}

export async function saveFile(filename: string, data: Blob): Promise<'downloaded' | 'cancelled'> {
  const save = globalThis.__AFTERIMAGE_SAVE_FILE__;
  if (typeof save === 'function') {
    try {
      await save(filename, data);
      return 'downloaded';
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'declined') return 'cancelled';
      throw reason;
    }
  }
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'downloaded';
}
