# SteamProfiler Player

The video player used by [steamprofiler.org](https://steamprofiler.org/), as a
small browser-native component that can be embedded independently. It has no
runtime dependencies and no framework or build step. It supports progressive
MP4/WebM, Steam's HLS delivery through MediaSource, keyboard controls,
fullscreen and picture-in-picture.

The repository has two deliberately separate responsibilities:

- `src/player.js` and `src/player.css` draw and control media. They know nothing
  about Steam app ids or the SteamProfiler API.
- `src/steam.js` is an optional adapter for the versioned public endpoint
  `https://steamprofiler.org/api/player?appid=<id>`.

Open `demo/index.html` through a local HTTP server to see both pieces together:

```sh
python3 -m http.server 8080
```

Then visit <http://127.0.0.1:8080/demo/?appid=620>.

## Use with a Steam app id

Include the stylesheet and import the two functions:

```html
<link rel="stylesheet" href="./node_modules/@steamprofiler/player/src/player.css">
<div id="video"></div>
<script type="module">
  import {
    steamTrailer,
    mountTrailer,
  } from './node_modules/@steamprofiler/player/src/index.js';

  const trailer = await steamTrailer(620);
  if (trailer.state === 'ready') {
    const player = mountTrailer(document.querySelector('#video'), trailer);
    await player.ready;
  }
</script>
```

The endpoint has three honest states:

- `ready`: `media` contains HLS, DASH and progressive addresses when Steam
  publishes them.
- `pending`: the app was cold and its store record has been queued. The response
  is cached for 20 seconds; retry after that, not in a tight loop.
- `absent`: the store record is known and carries no trailer.

The response is versioned independently from the site's internal API. Requests
use no credentials, the endpoint permits cross-origin reads, and no Steam API
key is sent to the browser.

## Use with your own video

The core accepts an ordinary `HTMLVideoElement`:

```js
import { mount } from '@steamprofiler/player/player';

const video = document.createElement('video');
video.src = 'https://example.com/video.mp4';
video.preload = 'metadata';
video.playsInline = true;

const player = mount(video, { title: 'Trailer' });
document.querySelector('#video').append(player.root);
```

`mount()` returns `root`, `reveal()`, `setLoading()`, `setQuality()` and
`destroy()`. `mountTrailer()` additionally returns `video` and a `ready`
promise.

## Styling

Set `--sp-accent` on the host or player root. The component owns only classes
prefixed with `sp-player`, so it can coexist with an application's stylesheet.

```css
#video { --sp-accent: #ffb000; }
```

## Attribution and license

This repository is licensed under the OSI-approved Common Public Attribution
License 1.0 (`CPAL-1.0`), not MIT. Exhibit B requires the visible
`steamprofiler.org` link that the component already renders. The requirement
also applies when the component is embedded in a larger application.

The main SteamProfiler frontend and API remain MIT. Separating the player is
what lets their permissive license and this component's visible-attribution
condition remain unambiguous. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The player source previously present in the MIT frontend remains available
under the grant attached to that published version. This repository governs
this independently versioned distribution and its future releases; an existing
MIT grant cannot be withdrawn retroactively.

This is a licensing structure, not legal advice. Have the attribution terms
reviewed by qualified counsel before relying on them commercially.

## Development

```sh
npm test
```

The test command checks every module's syntax and the API adapter contract.
