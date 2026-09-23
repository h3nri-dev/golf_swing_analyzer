import { clamp } from './analysis.js';
import { realTime, fileTime } from './timing.js';

export const MAX_ANALYSIS_SECONDS = 20;
export const DEFAULT_WINDOW = Object.freeze({before:.3,after:3.2});
export const WINDOW_STORAGE_KEY = 'golf_analysis_window';
export function validWindow(value) {
  return !!value&&[value.before,value.after].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)
    &&value.before+value.after>=.1&&value.before+value.after<=MAX_ANALYSIS_SECONDS;
}
export function readWindowSettings(storage) {
  try {const value=JSON.parse(storage?.getItem(WINDOW_STORAGE_KEY)??'null');if(validWindow(value))return {before:value.before,after:value.after};}catch{/* Private/blocked storage or malformed preferences. */}
  return {...DEFAULT_WINDOW};
}
// Offsets are real seconds; center/duration and returned bounds are file time.
// Clip each edge independently without shifting the playhead or the window.
export function analysisWindow(center, duration, settings = DEFAULT_WINDOW, rate = 1) {
  if (![center,duration,rate].every(Number.isFinite)||duration<=0||rate<=0||!validWindow(settings))return [0,0];
  const at = clamp(center, 0, duration);
  return [Math.max(0, at-settings.before*rate),Math.min(duration,at+settings.after*rate)];
}
export function analysisRangeError(start, end, duration, rate = 1, reuseSavedRange = false) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) return 'Load a video to analyze a window.';
  // Allow millisecond-rounded final timestamps.
  if (start < 0 || start >= duration || end > duration + 0.0005 * rate) return `Keep the range within the video (0–${(duration / rate).toFixed(3)} s).`;
  if (end <= start) return 'End must be after start.';
  // Retiming can make a previously analyzed interval exceed 20 real seconds.
  // Reuse its file bounds; the scanner still enforces its sample-count limits.
  if (!reuseSavedRange && (end - start) / rate > MAX_ANALYSIS_SECONDS + 0.000001) return 'Select up to 20 seconds per analysis. Move the playhead to choose a new window.';
  return '';
}

// The playback scrubber is also the analysis selector. Selection always follows
// each clip's playhead; scanning/export temporarily freeze its captured window.
export function createRangeSelector({ slots, state, changed, notice }) {
  const note = document.getElementById('analyzedRangeNote');
  let storage;try{storage=window.localStorage;}catch{/* The current session still works without storage. */}
  let settings=readWindowSettings(storage);
  const hint=document.getElementById('analysisWindowHint');
  hint.classList.add('analysis-window-settings');
  hint.innerHTML='<span>Analyze</span><label title="Real seconds before the current frame">−<input id="analysisBefore" type="number" min="0" max="20" step="0.1" aria-label="Analysis seconds before current frame"></label><label title="Real seconds after the current frame">+<input id="analysisAfter" type="number" min="0" max="20" step="0.1" aria-label="Analysis seconds after current frame"></label><span>s</span>';
  hint.title='These offsets select a new window in Full video. In Analyzed range, Analyze repeats the saved range regardless of the playhead or these settings. Saved in this browser for both videos. Maximum total: 20 seconds.';
  const inputs=[hint.querySelector('#analysisBefore'),hint.querySelector('#analysisAfter')];
  const fill=()=>inputs.forEach((input,i)=>{input.value=settings[i?'after':'before'];});fill();
  const apply=()=>{
    if(state().busy){fill();return;}
    const next={before:inputs[0].valueAsNumber,after:inputs[1].valueAsNumber};
    if(!validWindow(next)){fill();notice?.('Use non-negative seconds, totaling 0.1 to 20 seconds.');return;}
    settings=next;
    try{if(!storage)throw new Error('Storage unavailable');storage.setItem(WINDOW_STORAGE_KEY,JSON.stringify(settings));}
    catch{notice?.('Window updated for this session. Browser storage is unavailable.');}
    render();changed();
  };
  inputs.forEach(input=>input.addEventListener('change',apply));
  const windowAt=(center,duration,rate=1)=>analysisWindow(center,duration,settings,rate);
  function followCurrent(s) {
    if (!s.ready || state().busy) return false;
    const center=s.video.currentTime, span=fileTime(settings.before+settings.after,s);
    const [start,end]=windowAt(center,s.video.duration,fileTime(1,s));
    const moved=s.start!==start||s.end!==end||s.windowCenter!==center||s.windowSpan!==span;
    Object.assign(s,{start,end,windowCenter:center,windowSpan:span});
    return moved;
  }
  function render() {
    inputs.forEach(input=>input.disabled=state().busy);
    hint.setAttribute('aria-label',`Analysis window: ${settings.before} real seconds before and ${settings.after} real seconds after the current frame.`);
    let moved=false;
    slots.forEach(s=>{if(followCurrent(s))moved=true;});
    const {active,reviewFocused}=state(),s=slots[active],previous=s.analyzedRange;
    const same=previous&&Math.abs(previous[0]-s.start)<.001&&Math.abs(previous[1]-s.end)<.001;
    note.hidden=!previous||same||reviewFocused;
    note.textContent=previous?`Results: ${realTime(previous[0],s).toFixed(3)}–${realTime(previous[1],s).toFixed(3)} s. Analyze again to replace them with the green window.`:'';
    return moved;
  }
  return {render,renderPlayhead(){if(render())changed();},prepare:render,windowAt,
    description:()=>`${settings.before} s before and ${settings.after} s after the current frame`};
}
