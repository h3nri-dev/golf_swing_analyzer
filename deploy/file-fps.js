// Read the encoded video rate, never an audio, nominal or camera capture rate.
// MediaInfo durations are in seconds. A VFR/derived rate is only an average;
// it cannot provide exact per-frame timestamps for browser seeking.
export function extractFileFrameRate(result) {
  const videos = result?.media?.track?.filter(track => track['@type'] === 'Video') || [];
  const track = videos.find(track => ['Yes', '1', 1, true].includes(track.Default)) || videos[0];
  if (!track) return null;
  const positive = value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const reported = positive(track.FrameRate);
  const count = positive(track.FrameCount), duration = positive(track.Duration);
  const fps = reported || (count && duration ? count / duration : null);
  if (!fps || fps > 1000) return null;
  return {
    fps: Number(fps.toFixed(6)),
    variable: String(track.FrameRate_Mode).toUpperCase() === 'VFR',
    average: !reported || String(track.FrameRate_Mode).toUpperCase() === 'VFR',
  };
}

// One short-lived worker per file keeps parsing off the UI thread. Terminating
// it also releases the WASM heap and any pending reads on replacement/cancel.
export function detectFileFrameRate(file, { signal, timeout = 10000 } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve(null);
    let worker, timer, finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      resolve(result);
    };
    const abort = () => finish(null);
    try {
      worker = new Worker(new URL('./file-fps-worker.js', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = event => finish(event.data);
      worker.onerror = event => { event.preventDefault(); finish(null); };
      worker.onmessageerror = () => finish(null);
      timer = setTimeout(() => finish(null), timeout);
      // Files are structured-cloned as local Blobs, not read into a giant buffer.
      worker.postMessage(file);
    } catch {
      finish(null);
    }
  });
}
