import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PASSPHRASE_KEY, createApi, usesRemoteCompanion } from '../app/lib/api.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function recorder() {
  const calls: { input: string; init?: RequestInit }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response('{}');
  };
  return { calls, fetchImpl };
}

test('a site with its own server keeps calling its own /api routes unchanged', async () => {
  assert.equal(usesRemoteCompanion, false);
  const { calls, fetchImpl } = recorder();
  const storage = memoryStorage({ [PASSPHRASE_KEY]: 'never-sent' });
  const api = createApi({ fetchImpl, storage: () => storage });
  await api.apiFetch('/api/status', { cache: 'no-store' });
  assert.equal(calls[0].input, '/api/status');
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null);
});

test('the GitHub Pages build calls the companion directly with the stored passphrase', async () => {
  const { calls, fetchImpl } = recorder();
  const storage = memoryStorage();
  const api = createApi({ base: 'https://afterimage-claude.up.railway.app', fetchImpl, storage: () => storage });
  assert.equal(api.remote, true);

  await api.apiFetch('/api/status');
  assert.equal(calls[0].input, 'https://afterimage-claude.up.railway.app/api/status');
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null);

  assert.equal(api.savePassphrase('a-long-private-passphrase'), true);
  assert.equal(api.readPassphrase(), 'a-long-private-passphrase');
  await api.apiFetch('/api/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const headers = new Headers(calls[1].init?.headers);
  assert.equal(calls[1].input, 'https://afterimage-claude.up.railway.app/api/generations');
  assert.equal(headers.get('authorization'), 'Bearer a-long-private-passphrase');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(calls[1].init?.method, 'POST');

  assert.equal(api.savePassphrase(''), true);
  assert.equal(storage.values.has(PASSPHRASE_KEY), false);
});

test('the claude.ai Artifact build answers every private call inside the page', async () => {
  const { calls, fetchImpl } = recorder();
  const answered: string[] = [];
  const storage = memoryStorage({ [PASSPHRASE_KEY]: 'never-sent' });
  const api = createApi({
    base: 'https://companion.example', fetchImpl, storage: () => storage,
    inPage: async (path) => { answered.push(path); return Response.json({ authenticated: true }); },
  });
  assert.equal(api.answersInPage, true);
  assert.equal(api.remote, false);
  assert.deepEqual(await (await api.apiFetch('/api/status')).json(), { authenticated: true });
  assert.deepEqual(answered, ['/api/status']);
  assert.equal(calls.length, 0);
});

test('blocked browser storage is reported rather than pretending the passphrase was kept', () => {
  const api = createApi({ base: 'https://companion.example', storage: () => { throw new Error('blocked'); } });
  assert.equal(api.savePassphrase('a-long-private-passphrase'), false);
  assert.equal(api.readPassphrase(), '');
});

test('the page unlocks a locked companion with a passphrase form and routes every call through apiFetch', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /'PASSPHRASE_REQUIRED'/);
  assert.match(page, /Unlock AFTERIMAGE/);
  assert.match(page, /id="companion-passphrase" type="password"/);
  assert.match(page, /That passphrase did not unlock the companion\./);
  for (const file of ['../app/page.tsx', '../app/components/atlas.tsx', '../app/components/your-sky.tsx', '../app/components/film-identity.tsx', '../app/components/atlas-film-search.tsx', '../app/lib/enrichment-client.ts']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<![A-Za-z])fetch\(['`]\/api\//, file + ' calls /api without apiFetch');
  }
});
