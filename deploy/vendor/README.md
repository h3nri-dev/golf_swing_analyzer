# Browser libraries

`jspdf.umd.min.js` is the unmodified UMD browser build from the npm package `jspdf@4.2.1`, licensed under MIT (see `jspdf.LICENSE`). Downloaded from the official npm registry. Package integrity: `sha512-YyAXyvnmjTbR4bHQRLzex3CuINCDlQnBqoSYyjJwTP2x9jDLuKDzy7aKUl0hgx3uhcl7xzg32agn5vlie6HIlQ==`.

The app loads this local asset only when making a PDF. It uses text and image APIs; it does not use HTML rendering, external image URLs, or a PDF service. No videos or report contents leave the browser.

Upstream: https://github.com/parallax/jsPDF/releases/tag/v4.2.1

## MediaInfo.js

`mediainfo/mediainfo.js` is the unmodified minified ES-module browser bundle (`dist/esm-bundle/index.min.js`) and `mediainfo/MediaInfoModule.wasm` is the companion WASM from the official npm package `mediainfo.js@0.3.8`. BSD-2-Clause license: `mediainfo/LICENSE.txt`. Package integrity: `sha512-34ruGC47ytdp5IE9lXx4Yj8XMxESbzqLxDGfnYXimnokxH+aavC/YqubakOKm0vwrC5ZisL55WMmud6R6TmjBw==`.

The app loads these same-origin assets only when a video is selected. A dedicated worker reads local Blob slices to extract the encoded video frame rate, then terminates to free its WASM memory. No video, filename or metadata is sent to a service. The upstream source map is omitted; production does not use it.

Upstream: https://github.com/buzz/mediainfo.js / https://mediainfo.js.org/
