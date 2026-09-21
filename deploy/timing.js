import { clamp, frameTime, syncBounds } from './analysis.js';

// Media seconds per real second. A 120 FPS recording saved at 30 FPS needs
// four media seconds for each real second; ordinary 30/60 FPS files both use 1.
export function mediaRate(fileFps, shotFps = fileFps) {
  return shotFps / fileFps;
}

// The shared clock uses real seconds relative to A's start. B's origin is
// offset on that clock; file playheads, analysis ranges and drawings stay in
// media seconds so changing timing never rewrites their stored coordinates.
export function synchronization(clips, offset = 0) {
  const rates = clips.map(c => mediaRate(c.fps, c.shotFps ?? c.fps));
  const bounds = syncBounds(clips[0].duration / rates[0], clips[1].duration / rates[1], offset);
  if (!bounds) return null;
  const commonTime = (time, index) => time / rates[index] - (index ? offset : 0);
  const mediaTimes = time => {
    const target = clamp(time, bounds.start, bounds.end);
    return [target * rates[0], (target + offset) * rates[1]];
  };
  const shotRates = clips.map(c => c.shotFps ?? c.fps);
  const reference = shotRates[0] <= shotRates[1] ? 0 : 1;
  return {
    bounds, rates, commonTime, mediaTimes, reference,
    stepSeconds: 1 / shotRates[reference],
    // Allow two source frames of drift, with a browser display-tick floor.
    driftTolerance: Math.max(1 / 60, 2 / Math.min(...shotRates)),
    endTolerance: .5 / Math.max(...shotRates),
    step(times, direction) {
      const c = clips[reference];
      const next = frameTime(times[reference], direction, c.fps, 0, c.duration);
      return mediaTimes(commonTime(next, reference));
    },
  };
}
