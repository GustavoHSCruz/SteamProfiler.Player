/*
 * The contents of this file are subject to the Common Public Attribution
 * License Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. A copy is included in LICENSE.
 * The Original Code is SteamProfiler Player.
 * The Initial Developer is Gustavo Cruz. Copyright (c) 2026 Gustavo Cruz.
 * Software is provided "AS IS", without warranty of any kind.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { appidOf, steamTrailer } from '../src/steam.js';

test('appidOf accepts Steam app ids and rejects ambiguous input', () => {
  assert.equal(appidOf('620'), 620);
  assert.equal(appidOf(10), 10);
  for (const value of ['', '0', '12x', '123456789']) {
    assert.throws(() => appidOf(value), TypeError);
  }
});

test('steamTrailer requests the public contract without credentials', async () => {
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ version: 1, appid: 620, state: 'ready' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const payload = await steamTrailer(620, { endpoint: 'https://example.test/api/player' });
    assert.equal(payload.appid, 620);
    assert.equal(seen.url, 'https://example.test/api/player?appid=620');
    assert.equal(seen.init.credentials, 'omit');
    assert.equal(seen.init.mode, 'cors');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
