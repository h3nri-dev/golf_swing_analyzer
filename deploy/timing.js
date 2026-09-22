import { clamp, syncBounds } from './analysis.js';
import {sourceFrameNumber,sourceFrameTime,adjacentSourceBoundary} from './source-frames.js';

// Media seconds per real second. A 120 FPS recording saved at 30 FPS needs
// four media seconds for each real second; ordinary 30/60 FPS files both use 1.
export function mediaRate(fileFps, shotFps = fileFps) {
  return shotFps / fileFps;
}
export const clipRate = clip => mediaRate(clip.fps, clip.shotFps ?? clip.fps);
export const realTime = (time, clip) => time / clipRate(clip);
export const fileTime = (time, clip) => time * clipRate(clip);
// Browser seeks can round media timestamps down to microseconds. Preserve the
// requested frame label without treating ordinary between-frame times as later frames.
export const frameNumber = (time, fps, duration = Infinity) => Math.min(lastFrame(duration,fps), Math.max(0, Math.floor((time + 0.000001) * fps + 1e-7)));
export const seconds = time => Number.isFinite(time) ? time.toFixed(3) : '—';
export function frameStamp(time, clip) {
  return `${seconds(realTime(time, clip))} s · F${sourceFrameNumber(time,clip)}`;
}
export function lastFrame(duration, fps) { return Number.isNaN(duration) ? 0 : Math.max(0, Math.ceil(duration * fps - 0.00001) - 1); }
export function markedFrame(time, clip) {
  return sourceFrameTime(sourceFrameNumber(time,clip),clip);
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
  return {
    bounds, rates, commonTime, mediaTimes,
    // Allow two source frames of drift, with a browser display-tick floor.
    driftTolerance: Math.max(1 / 60, 2 / Math.min(...shotRates)),
    endTolerance: .5 / Math.max(...shotRates),
    step(times, direction) {
      const now=commonTime(times[0],0);
      const candidates=clips.map((clip,i)=>{
        const next=adjacentSourceBoundary((now+(i?offset:0))*rates[i],direction,clip);
        return next===null?null:commonTime(next,i);
      }).filter(t=>t!==null&&(t-now)*direction>0.000002/Math.min(...rates));
      const next=candidates.length?(direction>0?Math.min(...candidates):Math.max(...candidates)):now;
      return mediaTimes(next);
    },
  };
}
