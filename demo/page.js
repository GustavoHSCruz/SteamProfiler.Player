/*
 * The contents of this file are subject to the Common Public Attribution
 * License Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. A copy is included in LICENSE.
 * The Original Code is SteamProfiler Player.
 * The Initial Developer is Gustavo Cruz. Copyright (c) 2026 Gustavo Cruz.
 * Software is provided "AS IS", without warranty of any kind.
 */
import { mountTrailer, waitForSteamTrailer } from '../src/index.js';

const form = document.querySelector('#lookup');
const input = document.querySelector('#appid');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const storeLink = document.querySelector('#store-link');
let request = null;
let mounted = null;

const params = new URLSearchParams(location.search);
if (params.get('appid')) input.value = params.get('appid');

async function load(appid) {
  request?.abort();
  mounted?.destroy();
  request = new AbortController();
  mounted = null;
  storeLink.hidden = true;
  stage.replaceChildren();
  stage.append(Object.assign(document.createElement('p'), { textContent: 'Lendo o catálogo da Steam…' }));
  status.textContent = 'Consultando a API pública do SteamProfiler.';

  try {
    const payload = await waitForSteamTrailer(appid, { signal: request.signal });
    history.replaceState(null, '', `?appid=${payload.appid}`);
    storeLink.href = payload.store_url;
    storeLink.hidden = false;
    if (payload.state === 'pending') {
      stage.firstElementChild.textContent = 'O catálogo ainda está sendo preenchido. Tente novamente em alguns segundos.';
      status.textContent = 'A leitura foi enfileirada, mas ainda não terminou.';
      return;
    }
    if (payload.state === 'absent') {
      stage.firstElementChild.textContent = 'A Steam não publicou um trailer para este jogo.';
      status.textContent = payload.title || `App ${payload.appid}`;
      return;
    }

    mounted = mountTrailer(stage, payload, {
      labels: {
        play: 'Reproduzir', pause: 'Pausar', replay: 'Repetir', mute: 'Silenciar',
        unmute: 'Ativar som', volume: 'Volume', seek: 'Posição',
        fullscreen: 'Tela cheia', exit_fullscreen: 'Sair da tela cheia',
        pip: 'Picture in picture',
      },
    });
    status.textContent = `${payload.title || `App ${payload.appid}`} · resposta v${payload.version}`;
    await mounted.ready;
  } catch (error) {
    if (error.name === 'AbortError') return;
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      textContent: 'Não foi possível montar este trailer.',
    }));
    status.textContent = error.message;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  load(input.value);
});

load(input.value);
