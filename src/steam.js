/*
 * The contents of this file are subject to the Common Public Attribution
 * License Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. A copy is included in LICENSE.
 * The Original Code is SteamProfiler Player.
 * The Initial Developer is Gustavo Cruz. Copyright (c) 2026 Gustavo Cruz.
 * Software is provided "AS IS", without warranty of any kind.
 */

const DEFAULT_ENDPOINT = 'https://steamprofiler.org/api/player';

function appidOf(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,8}$/.test(text) || text === '0') {
    throw new TypeError('appid must contain between one and eight digits');
  }
  return Number(text);
}

async function steamTrailer(appid, options = {}) {
  const id = appidOf(appid);
  const endpoint = new URL(options.endpoint || DEFAULT_ENDPOINT);
  endpoint.searchParams.set('appid', String(id));

  const response = await fetch(endpoint, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `SteamProfiler player API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (payload?.version !== 1 || payload?.appid !== id) {
    throw new Error('unsupported SteamProfiler player response');
  }
  return payload;
}

/** Ask until a cold app has been read from the Steam store.
 *  The API advertises a twenty-second cache for pending rows, so polling any
 *  faster only asks a cache the same question again. */
async function waitForSteamTrailer(appid, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 4);
  const interval = Math.max(20_000, Number(options.interval) || 20_000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const payload = await steamTrailer(appid, options);
    if (payload.state !== 'pending' || attempt === attempts - 1) return payload;
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, interval);
      options.signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
  throw new Error('unreachable');
}

export { DEFAULT_ENDPOINT, appidOf, steamTrailer, waitForSteamTrailer };
