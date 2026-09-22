import { clamp } from './analysis.js';
import { clipRate, realTime, fileTime } from './timing.js';

export const MAX_ANALYSIS_SECONDS = 20;
export const DEFAULT_WINDOW_SECONDS = 10;
// Clip each edge independently: never reach more than half the window from
// its center. Arguments share one unit (real seconds or file seconds).
export function analysisWindow(center, duration, span = DEFAULT_WINDOW_SECONDS) {
  if (![center, duration, span].every(Number.isFinite) || duration <= 0 || span <= 0) return [0, 0];
  const at = clamp(center, 0, duration);
  return [Math.max(0, at - span / 2), Math.min(duration, at + span / 2)];
}
export function analysisRangeError(start, end, duration, rate = 1) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) return 'Enter a start and end time.';
  // Times are editable to milliseconds; allow the rounded final timestamp.
  if (start < 0 || start >= duration || end > duration + 0.0005 * rate) return `Keep the range within the video (0–${(duration / rate).toFixed(3)} s).`;
  if (end <= start) return 'End must be after start.';
  if ((end - start) / rate > MAX_ANALYSIS_SECONDS + 0.000001) return 'Select up to 20 seconds per analysis. Adjust the times or choose Follow ±5s.';
  return '';
}

export function createRangeSelector({ slots, state, seek, pause, changed }) {
  const $ = id => document.getElementById(id);
  const panel = $('rangeSelection');
  const current = () => slots[state().active];
  const format = value => Number.isFinite(value) ? value.toFixed(3) : '';
  function followCurrent(s = current()) {
    if (!s.ready || state().busy || s.rangeAuto === false) return false;
    const center = s.video.currentTime, span = fileTime(DEFAULT_WINDOW_SECONDS, s);
    const [start, end] = analysisWindow(center, s.video.duration, span);
    const moved = s.start !== start || s.end !== end || s.windowCenter !== center || s.windowSpan !== span;
    Object.assign(s, { start, end, windowCenter: center, windowSpan: span });
    return moved;
  }
  function edit(field, value, { preserveInputs = false } = {}) {
    const s = current();
    if (!s.ready || state().busy) return;
    s.rangeAuto = false; s[field] = value;
    if (!analysisRangeError(s.start, s.end, s.video.duration, clipRate(s))) {
      s.windowCenter = (s.start + s.end) / 2; s.windowSpan = s.end - s.start;
    }
    render(preserveInputs); changed();
  }
  for (const [suffix, field] of [['Start', 'start'], ['End', 'end']]) {
    $(`range${suffix}`).oninput = e => edit(field, fileTime(e.target.valueAsNumber, current()), { preserveInputs: true });
    $(`rangeSet${suffix}`).onclick = () => { pause(); edit(field, current().video.currentTime); };
    $(`rangeGo${suffix}`).onclick = () => {
      const s = current(); if (!s.ready || state().busy) return;
      s.rangeAuto = false; seek(s[field]); render(); changed();
    };
  }
  $('rangeReset').onclick = () => {
    const s = current(); if (!s.ready || state().busy) return;
    followCurrent(s); s.rangeAuto = s.rangeAuto === false;
    render(); changed();
  };
  function slide(center) {
    const s = current(); if (!s.ready || state().busy) return;
    const span = s.rangeAuto !== false || analysisRangeError(s.start, s.end, s.video.duration, clipRate(s))
      ? fileTime(DEFAULT_WINDOW_SECONDS, s) : s.windowSpan;
    s.rangeAuto = false; s.windowSpan = span;
    s.windowCenter = clamp(fileTime(center, s), 0, s.video.duration);
    [s.start, s.end] = analysisWindow(s.windowCenter, s.video.duration, span);
    render(); changed();
  }
  $('rangeWindow').oninput = e => slide(e.target.valueAsNumber);
  $('rangeWindow').onkeydown = e => {
    const s = current(); if (!s.ready || state().busy || e.altKey || e.ctrlKey || e.metaKey) return;
    const direction = {ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:5,PageDown:-5}[e.key];
    if (direction === undefined && !['Home','End'].includes(e.key)) return;
    e.preventDefault();
    const at = realTime(s.windowCenter, s), step = e.shiftKey ? 1 / (s.shotFps ?? s.fps) : 1;
    slide(e.key === 'Home' ? 0 : e.key === 'End' ? realTime(s.video.duration,s) : at + direction * step);
  };
  function render(preserveInputs = false) {
    const s = current(), { active, mode, busy } = state(), duration = s.ready ? s.video.duration : 0;
    slots.forEach(followCurrent);
    const error = s.ready ? analysisRangeError(s.start, s.end, duration, clipRate(s)) : '';
    const show = time => format(realTime(time, s));
    const name = mode==='compare' ? `Swing ${active ? 'B' : 'A'}` : 'Your swing';
    panel.querySelectorAll('input,button').forEach(el => el.disabled = !s.ready || busy);
    $('rangeReset').disabled = !s.ready || busy;
    $('cancelSelection').hidden = !busy; $('cancelSelection').disabled = !busy;
    $('rangeStatus').hidden = !s.analysisAttempted; $('rangeStatus').textContent = s.status;
    $('analyzeSelection').disabled = !s.ready || busy || !!error;
    $('rangeTarget').textContent = name;
    $('rangeClipDuration').textContent = `${show(duration)} s real`;
    for (const [suffix, field] of [['Start', 'start'], ['End', 'end']]) {
      const input = $(`range${suffix}`);
      input.max = realTime(duration, s);
      input.title = 'Elapsed real seconds, using File FPS and Shot FPS';
      if (!preserveInputs) input.value = show(s[field]);
      input.setAttribute('aria-invalid', !!error);
      $(`rangeGo${suffix}`).disabled = !s.ready || busy || !Number.isFinite(s[field]) || s[field] < 0 || s[field] > duration + 0.0005 * clipRate(s);
    }
    const windowControl = $('rangeWindow');
    windowControl.max = realTime(duration, s) || 1;
    windowControl.value = Number.isFinite(s.windowCenter) ? realTime(s.windowCenter, s) : 0;
    windowControl.setAttribute('aria-valuetext', `${show(s.start)} to ${show(s.end)} real seconds, ${s.rangeAuto !== false ? 'following playhead' : 'pinned window'}`);
    windowControl.title = 'Drag the whole window. Arrow keys move 1 second; Shift + arrow moves one recorded frame. The video stays in place.';
    const startPercent = duration && Number.isFinite(s.start) ? clamp(s.start / duration * 100, 0, 100) : 0;
    const endPercent = duration && Number.isFinite(s.end) ? clamp(s.end / duration * 100, 0, 100) : 0;
    $('rangeBand').style.left = `${startPercent}%`;
    $('rangeBand').style.width = `${Math.max(0, endPercent - startPercent)}%`;
    panel.classList.toggle('invalid-range', !!error);
    $('rangeError').hidden = !error; $('rangeError').textContent = error;
    $('rangeSummary').textContent = !s.ready ? 'Pause at your swing, then Analyze.' : error ? 'Adjust the selected range.' : `${s.rangeAuto !== false ? 'Following' : 'Pinned'} · ${show(s.end - s.start)} s`;
    $('analysisRangeSummary').textContent = !s.ready ? 'Add a video to select a range.' : error ? 'Adjust the selection in Range.' : `${name} · ${show(s.start)}–${show(s.end)} s`;
    $('rangeReset').textContent = 'Follow ±5s';
    $('rangeReset').setAttribute('aria-pressed', s.rangeAuto !== false);
    $('rangeReset').title = s.rangeAuto !== false ? 'Window follows playback: five real seconds before and after the current frame. Click to pin it.' : 'Return to five real seconds before and after the current frame. Clip edges shorten the window.';
    const previous = s.analyzedRange;
    // Restoring a playing video's frame can round its timestamp to microseconds.
    const sameRange = previous && Math.abs(previous[0] - s.start) < 0.000002 && Math.abs(previous[1] - s.end) < 0.000002;
    $('analyzedRangeNote').hidden = !previous || sameRange;
    $('analyzedRangeNote').textContent = previous ? `Results are for ${show(previous[0])}–${show(previous[1])} s. Analyze again to update them.` : '';
    paintPlayhead();
  }
  function paintPlayhead() {
    const s = current();
    $('rangePlayhead').hidden = !s.ready;
    $('rangePlayhead').style.left = `${s.ready ? clamp(s.video.currentTime / s.video.duration * 100, 0, 100) : 0}%`;
  }
  function renderPlayhead() {
    let moved = false;
    slots.forEach(s => { if (followCurrent(s) && s === current()) moved = true; });
    if (moved) { render(); changed(); }
    else paintPlayhead();
  }
  return { render, renderPlayhead, prepare: () => { followCurrent(); render(); } };
}
