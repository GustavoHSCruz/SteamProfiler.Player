/*
 * The contents of this file are subject to the Common Public Attribution
 * License Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License. A copy is included in LICENSE.
 * The Original Code is SteamProfiler Player.
 * The Initial Developer is Gustavo Cruz. Copyright (c) 2026 Gustavo Cruz.
 * Software is provided "AS IS", without warranty of any kind.
 */
/* The media file is somebody else's; every pixel around it belongs here. */
'use strict';

  const svg = (path) => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = path;
    return icon;
  };

  const icons = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/>',
    replay: '<path d="M7.4 7.4A7 7 0 1 1 5 12H2l4-4 4 4H7a5 5 0 1 0 1.8-3.8z" fill="currentColor"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9zm11.5-.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    muted: '<path d="M4 9v6h4l5 4V5L8 9zm12 1 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2"/>',
    shrink: '<path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2"/>',
    pip: '<path d="M3 5h18v14H3zm9 7h7v5h-7z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  };

  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  const clock = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };

  const manifestValue = (line, key) => {
    const match = new RegExp(`${key}=(?:"([^"]*)"|([^,]*))`).exec(line);
    return match ? (match[1] || match[2] || '') : '';
  };

  async function read(url, bytes = false) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`media ${response.status}`);
    return bytes ? response.arrayBuffer() : response.text();
  }

  const mediaFiles = (playlist, base) => playlist.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new URL(line, base).href);

  const initFile = (playlist, base) => {
    const match = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist);
    return match ? new URL(match[1], base).href : null;
  };

  // MediaSource treats an open stream as having an infinite duration until it
  // is explicitly told otherwise. Steam's media playlist already carries the
  // exact duration of every segment, so use that information immediately: the
  // clock and seek rail must work while the remaining segments are buffering,
  // not only after the entire trailer has downloaded.
  const playlistDuration = (playlist) => {
    let total = 0;
    for (const match of playlist.matchAll(/^#EXTINF:([0-9.]+)/gm)) {
      total += Number(match[1]) || 0;
    }
    return total;
  };

  const append = (buffer, data) => new Promise((resolve, reject) => {
    const done = () => { buffer.removeEventListener('error', failed); resolve(); };
    const failed = () => { buffer.removeEventListener('updateend', done); reject(new Error('media buffer')); };
    buffer.addEventListener('updateend', done, { once: true });
    buffer.addEventListener('error', failed, { once: true });
    try { buffer.appendBuffer(data); } catch (error) { failed(); }
  });

  async function appendTrack(buffer, init, segments) {
    if (init) await append(buffer, await read(init, true));
    for (const segment of segments) await append(buffer, await read(segment, true));
  }

  /** Play Steam's modern HLS delivery without borrowing a visible player.
   *  Steam separates H.264 video and AAC audio into ordinary fMP4 segments;
   *  MediaSource is the browser primitive for putting those tracks together.
   *  The highest resolution in the master is chosen deliberately. */
  async function attachHls(video, masterUrl) {
    const master = await read(masterUrl);
    const lines = master.split(/\r?\n/).map((line) => line.trim());
    const variants = [];
    let audioUrl = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-MEDIA:') && manifestValue(lines[i], 'TYPE') === 'AUDIO') {
        const uri = manifestValue(lines[i], 'URI');
        if (uri && !audioUrl) audioUrl = new URL(uri, masterUrl).href;
      }
      if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
      let file = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j] || lines[j].startsWith('#')) continue;
        file = lines[j];
        break;
      }
      const resolution = manifestValue(lines[i], 'RESOLUTION').split('x').map(Number);
      variants.push({
        url: new URL(file, masterUrl).href,
        width: resolution[0] || 0,
        height: resolution[1] || 0,
        bandwidth: Number(manifestValue(lines[i], 'BANDWIDTH')) || 0,
        codecs: manifestValue(lines[i], 'CODECS').split(',').map((codec) => codec.trim()),
      });
    }
    variants.sort((a, b) => (b.width * b.height - a.width * a.height) || b.bandwidth - a.bandwidth);
    const best = variants[0];
    if (!best || !best.url) throw new Error('no HLS rendition');

    // Last-resort path for engines without MediaSource. Their native HLS
    // implementation still reads the master, though it may adapt under load.
    if (!window.MediaSource) {
      video.src = masterUrl;
      video.dataset.quality = best.height ? `${best.height}P` : 'MAX';
      return { height: best.height, native: true };
    }

    const [videoList, audioList] = await Promise.all([
      read(best.url),
      audioUrl ? read(audioUrl) : Promise.resolve(''),
    ]);
    const streamDuration = Math.max(playlistDuration(videoList), playlistDuration(audioList));
    if (streamDuration > 0) {
      video.dataset.duration = String(streamDuration);
      video.dispatchEvent(new Event('spdurationchange'));
    }
    const videoCodec = best.codecs.find((codec) => /^(avc|hev|hvc|av01)/i.test(codec)) || 'avc1.640029';
    const audioCodec = best.codecs.find((codec) => /^(mp4a|opus)/i.test(codec)) || 'mp4a.40.2';
    const videoType = `video/mp4; codecs="${videoCodec}"`;
    const audioType = `audio/mp4; codecs="${audioCodec}"`;
    if (!MediaSource.isTypeSupported(videoType) || (audioUrl && !MediaSource.isTypeSupported(audioType))) {
      video.src = masterUrl;
      video.dataset.quality = best.height ? `${best.height}P` : 'MAX';
      return { height: best.height, native: true };
    }

    video.replaceChildren();
    const source = new MediaSource();
    const objectUrl = URL.createObjectURL(source);
    video.src = objectUrl;
    await new Promise((resolve, reject) => {
      source.addEventListener('sourceopen', resolve, { once: true });
      source.addEventListener('sourceclose', () => reject(new Error('media source closed')), { once: true });
    });
    URL.revokeObjectURL(objectUrl);

    const videoBuffer = source.addSourceBuffer(videoType);
    const jobs = [appendTrack(videoBuffer, initFile(videoList, best.url), mediaFiles(videoList, best.url))];
    if (audioUrl) {
      const audioBuffer = source.addSourceBuffer(audioType);
      jobs.push(appendTrack(audioBuffer, initFile(audioList, audioUrl), mediaFiles(audioList, audioUrl)));
    }
    if (streamDuration > 0 && source.readyState === 'open') source.duration = streamDuration;
    video.dataset.quality = best.height ? `${best.height}P` : 'MAX';
    await Promise.all(jobs);
    if (source.readyState === 'open' && !source.sourceBuffers[0].updating) source.endOfStream();
    return { height: best.height, native: false };
  }

  function button(cls, label, icon) {
    const el = node('button', `sp-player-btn ${cls}`);
    el.type = 'button';
    el.setAttribute('aria-label', label);
    el.title = label;
    el.append(svg(icon));
    return el;
  }

  function mount(video, options = {}) {
    const labels = options.labels || {};
    const label = (key, fallback) => labels[key] || fallback;
    const root = node('div', 'sp-player');
    root.tabIndex = 0;
    root.dataset.state = 'idle';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', options.title || 'SteamProfiler video player');
    video.classList.add('sp-player-video');
    video.controls = false;

    const chrome = node('div', 'sp-player-chrome');
    const top = node('div', 'sp-player-top');
    const brand = node('a', 'sp-player-brand');
    brand.href = 'https://steamprofiler.org/';
    brand.target = '_blank';
    brand.rel = 'noopener';
    brand.setAttribute('aria-label', 'steamprofiler.org');
    brand.append(node('i', '', '■'), document.createTextNode(' STEAMPROFILER'), node('b', '', '.ORG'));
    const title = node('strong', 'sp-player-title', options.title || '');
    top.append(brand, title);

    const loader = node('div', 'sp-player-loader');
    loader.setAttribute('aria-hidden', 'true');
    loader.append(node('i'), node('i'), node('i'), node('i'));

    const big = button('sp-player-big', label('play', 'Play'), icons.play);
    const bottom = node('div', 'sp-player-bottom');
    const rail = node('div', 'sp-player-rail');
    const buffered = node('span', 'sp-player-buffered');
    const played = node('span', 'sp-player-played');
    const seek = node('input', 'sp-player-seek');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.step = '1';
    seek.value = '0';
    seek.setAttribute('aria-label', label('seek', 'Seek'));
    rail.append(buffered, played, seek);

    const row = node('div', 'sp-player-controls');
    const toggle = button('sp-player-toggle', label('play', 'Play'), icons.play);
    const current = node('time', 'sp-player-time', '0:00');
    const divide = node('span', 'sp-player-divide', '/');
    const duration = node('time', 'sp-player-duration', '0:00');
    const live = node('span', 'sp-player-live', 'MAX');
    const spacer = node('span', 'sp-player-spacer');
    const volumeButton = button('sp-player-volume-btn', label('mute', 'Mute'), icons.volume);
    const volume = node('input', 'sp-player-volume');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '1';
    volume.value = String(Math.round(video.volume * 100));
    volume.setAttribute('aria-label', label('volume', 'Volume'));
    const pip = button('sp-player-pip', label('pip', 'Picture in picture'), icons.pip);
    const full = button('sp-player-full', label('fullscreen', 'Fullscreen'), icons.fullscreen);
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) pip.hidden = true;
    row.append(toggle, current, divide, duration, live, spacer, volumeButton, volume, pip, full);
    bottom.append(rail, row);
    chrome.append(top, big, loader, bottom);
    root.append(video, chrome);

    let hideTimer = 0;
    let seeking = false;
    const listeners = [];
    const on = (target, event, fn, opts) => {
      target.addEventListener(event, fn, opts);
      listeners.push(() => target.removeEventListener(event, fn, opts));
    };

    const useIcon = (control, name, aria) => {
      control.replaceChildren(svg(icons[name]));
      control.setAttribute('aria-label', aria);
      control.title = aria;
    };

    const reveal = () => {
      root.dataset.controls = '1';
      window.clearTimeout(hideTimer);
      if (!video.paused && !video.ended) {
        hideTimer = window.setTimeout(() => { root.dataset.controls = '0'; }, 2100);
      }
    };

    const syncPlay = () => {
      const playing = !video.paused && !video.ended;
      root.dataset.state = video.ended ? 'ended' : playing ? 'playing' : 'paused';
      useIcon(toggle, playing ? 'pause' : video.ended ? 'replay' : 'play',
        playing ? label('pause', 'Pause') : video.ended ? label('replay', 'Replay') : label('play', 'Play'));
      useIcon(big, video.ended ? 'replay' : 'play',
        video.ended ? label('replay', 'Replay') : label('play', 'Play'));
      reveal();
    };

    const totalDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
      return Number(video.dataset.duration) || 0;
    };

    const syncTime = () => {
      const total = totalDuration();
      const ratio = total ? video.currentTime / total : 0;
      current.textContent = clock(video.currentTime);
      duration.textContent = clock(total);
      if (!seeking) seek.value = String(Math.round(ratio * 1000));
      played.style.width = `${ratio * 100}%`;
      seek.setAttribute('aria-valuetext', `${clock(video.currentTime)} / ${clock(total)}`);
    };

    const syncBuffer = () => {
      const total = totalDuration();
      if (!total || !video.buffered.length) return;
      let end = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime + 1) end = Math.max(end, video.buffered.end(i));
      }
      buffered.style.width = `${Math.min(100, (end / total) * 100)}%`;
    };

    const syncVolume = () => {
      const silent = video.muted || video.volume === 0;
      volume.value = String(Math.round(video.volume * 100));
      root.style.setProperty('--sp-volume', `${silent ? 0 : video.volume * 100}%`);
      useIcon(volumeButton, silent ? 'muted' : 'volume',
        silent ? label('unmute', 'Unmute') : label('mute', 'Mute'));
    };

    const togglePlay = () => {
      if (video.ended) video.currentTime = 0;
      if (video.paused || video.ended) video.play().catch(() => {});
      else video.pause();
    };

    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    const toggleFull = () => {
      if (fullscreenElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (request) request.call(root);
      }
    };

    on(toggle, 'click', togglePlay);
    on(big, 'click', togglePlay);
    on(video, 'click', togglePlay);
    on(root, 'pointermove', reveal);
    on(root, 'pointerdown', reveal);
    on(root, 'focusin', reveal);
    on(video, 'play', syncPlay);
    on(video, 'pause', syncPlay);
    on(video, 'ended', syncPlay);
    on(video, 'timeupdate', syncTime);
    on(video, 'durationchange', syncTime);
    on(video, 'spdurationchange', syncTime);
    on(video, 'loadedmetadata', () => {
      live.textContent = `MAX · ${video.dataset.quality || (video.videoHeight ? `${video.videoHeight}P` : 'VIDEO')}`;
    });
    on(video, 'progress', syncBuffer);
    on(video, 'waiting', () => { root.dataset.loading = '1'; });
    on(video, 'playing', () => { root.dataset.loading = '0'; });
    on(video, 'canplay', () => { root.dataset.loading = '0'; });
    on(video, 'volumechange', syncVolume);
    on(seek, 'input', () => {
      seeking = true;
      const total = totalDuration();
      const next = (Number(seek.value) / 1000) * total;
      played.style.width = `${Number(seek.value) / 10}%`;
      current.textContent = clock(next);
    });
    on(seek, 'change', () => {
      const total = totalDuration();
      if (total) video.currentTime = (Number(seek.value) / 1000) * total;
      seeking = false;
      syncTime();
    });
    on(volume, 'input', () => {
      video.volume = Number(volume.value) / 100;
      video.muted = false;
    });
    on(volumeButton, 'click', () => { video.muted = !video.muted; });
    on(full, 'click', toggleFull);
    on(pip, 'click', async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch { /* the browser keeps the ordinary player available */ }
    });
    const fullscreenChange = () => {
      const active = fullscreenElement() === root;
      useIcon(full, active ? 'shrink' : 'fullscreen', active
        ? label('exit_fullscreen', 'Exit fullscreen') : label('fullscreen', 'Fullscreen'));
    };
    on(document, 'fullscreenchange', fullscreenChange);
    on(document, 'webkitfullscreenchange', fullscreenChange);
    on(root, 'keydown', (event) => {
      // Native controls and the attribution link own their own keys. Letting a
      // Space on a button bubble into the player's shortcut would toggle twice.
      if (event.target.closest('a, button, input')) return;
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'k') { event.preventDefault(); togglePlay(); }
      else if (key === 'arrowleft') { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
      else if (key === 'arrowright') { event.preventDefault(); video.currentTime = Math.min(totalDuration() || Infinity, video.currentTime + 5); }
      else if (key === 'arrowup') { event.preventDefault(); video.volume = Math.min(1, video.volume + .1); }
      else if (key === 'arrowdown') { event.preventDefault(); video.volume = Math.max(0, video.volume - .1); }
      else if (key === 'm') { event.preventDefault(); video.muted = !video.muted; }
      else if (key === 'f') { event.preventDefault(); toggleFull(); }
    });

    syncPlay();
    syncTime();
    syncVolume();
    reveal();

    return {
      root,
      reveal,
      setLoading(active) { root.dataset.loading = active ? '1' : '0'; },
      setQuality(value) { live.textContent = `MAX · ${value}`; },
      destroy() {
        window.clearTimeout(hideTimer);
        for (const off of listeners) off();
      },
    };
  }

function mountTrailer(host, payload, options = {}) {
  if (!host || typeof host.replaceChildren !== 'function') {
    throw new TypeError('host must be a DOM element');
  }
  if (payload?.version !== 1 || payload?.state !== 'ready' || !payload.media) {
    throw new TypeError('payload must be a ready SteamProfiler player response');
  }

  const video = document.createElement('video');
  video.preload = options.preload || 'metadata';
  video.playsInline = true;
  if (payload.poster) video.poster = payload.poster;

  const player = mount(video, {
    ...options,
    title: options.title || payload.title || '',
  });
  host.replaceChildren(player.root);

  const useProgressive = () => {
    video.removeAttribute('src');
    video.replaceChildren();
    for (const src of payload.media.mp4 || []) {
      const source = document.createElement('source');
      source.src = src;
      source.type = 'video/mp4';
      video.append(source);
    }
    for (const src of payload.media.webm || []) {
      const source = document.createElement('source');
      source.src = src;
      source.type = 'video/webm';
      video.append(source);
    }
    if (!video.children.length) throw new Error('trailer has no browser-compatible source');
    video.load();
    return { height: 0, native: true };
  };

  const ready = (async () => {
    if (!payload.media.hls) return useProgressive();
    player.setLoading(true);
    try {
      const quality = await attachHls(video, payload.media.hls);
      player.setQuality(quality.height ? `${quality.height}P` : 'AUTO');
      return quality;
    } catch {
      return useProgressive();
    } finally {
      player.setLoading(false);
    }
  })();

  return { ...player, video, ready };
}

export { mount, attachHls, mountTrailer };
