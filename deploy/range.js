import { clamp } from './analysis.js';
import { realTime, fileTime } from './timing.js';

export const MAX_ANALYSIS_SECONDS = 20;
export const DEFAULT_WINDOW_SECONDS = 5;
// Clip each edge independently: never reach more than half the window from
// its center. Arguments share one unit (real seconds or file seconds).
export function analysisWindow(center, duration, span = DEFAULT_WINDOW_SECONDS) {
  if (![center, duration, span].every(Number.isFinite) || duration <= 0 || span <= 0) return [0, 0];
  const at = clamp(center, 0, duration);
  return [Math.max(0, at - span / 2), Math.min(duration, at + span / 2)];
}
export function analysisRangeError(start, end, duration, rate = 1) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) return 'Load a video to analyze a window.';
  // Allow millisecond-rounded final timestamps.
  if (start < 0 || start >= duration || end > duration + 0.0005 * rate) return `Keep the range within the video (0–${(duration / rate).toFixed(3)} s).`;
  if (end <= start) return 'End must be after start.';
  if ((end - start) / rate > MAX_ANALYSIS_SECONDS + 0.000001) return 'Select up to 20 seconds per analysis. Move the playhead to choose a new window.';
  return '';
}

// The playback scrubber is also the analysis selector. Selection always follows
// each clip's playhead; scanning/export temporarily freeze its captured window.
export function createRangeSelector({ slots, state, changed }) {
  const note = document.getElementById('analyzedRangeNote');
  function followCurrent(s) {
    if (!s.ready || state().busy) return false;
    const center=s.video.currentTime, span=fileTime(DEFAULT_WINDOW_SECONDS,s);
    const [start,end]=analysisWindow(center,s.video.duration,span);
    const moved=s.start!==start||s.end!==end||s.windowCenter!==center||s.windowSpan!==span;
    Object.assign(s,{start,end,windowCenter:center,windowSpan:span});
    return moved;
  }
  function render() {
    let moved=false;
    slots.forEach(s=>{if(followCurrent(s))moved=true;});
    const {active,reviewFocused}=state(),s=slots[active],previous=s.analyzedRange;
    const same=previous&&Math.abs(previous[0]-s.start)<.001&&Math.abs(previous[1]-s.end)<.001;
    note.hidden=!previous||same||reviewFocused;
    note.textContent=previous?`Results: ${realTime(previous[0],s).toFixed(3)}–${realTime(previous[1],s).toFixed(3)} s. Analyze again to replace them with the green window.`:'';
    return moved;
  }
  return {render,renderPlayhead(){if(render())changed();},prepare:render};
}
