// Where the browser reaches AFTERIMAGE's private routes. A site with its own
// server serves them at `/api/…`. The GitHub Pages build has no server: it is
// compiled with the companion's address and calls it directly, unlocked by the
// owner's passphrase, which stays in this browser.
declare const __AFTERIMAGE_API_BASE__: string | undefined;

export const PASSPHRASE_KEY = 'afterimage:companion-passphrase:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function createApi({
  base = '',
  fetchImpl = (input, init) => fetch(input, init),
  storage = browserStorage,
}: { base?: string; fetchImpl?: FetchLike; storage?: () => StorageLike | null } = {}) {
  const remote = base.length > 0;

  function readPassphrase(): string {
    try { return storage()?.getItem(PASSPHRASE_KEY) || ''; } catch { return ''; }
  }

  function savePassphrase(value: string): boolean {
    try {
      const store = storage();
      if (!store) return false;
      if (value) store.setItem(PASSPHRASE_KEY, value);
      else store.removeItem(PASSPHRASE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (!remote) return fetchImpl(path, init);
    const headers = new Headers(init.headers);
    const passphrase = readPassphrase();
    if (passphrase) headers.set('Authorization', `Bearer ${passphrase}`);
    return fetchImpl(base + path, { ...init, headers });
  }

  return { remote, apiFetch, readPassphrase, savePassphrase };
}

const api = createApi({ base: typeof __AFTERIMAGE_API_BASE__ === 'string' ? __AFTERIMAGE_API_BASE__.replace(/\/$/, '') : '' });

export const usesRemoteCompanion = api.remote;
export const apiFetch = api.apiFetch;
export const readPassphrase = api.readPassphrase;
export const savePassphrase = api.savePassphrase;
