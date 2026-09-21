import { clamp } from './analysis.js';
import { clipRate, realTime, fileTime } from './timing.js';

export const MAX_ANALYSIS_SECONDS = 20;
export function analysisRangeError(start, end, duration, rate = 1) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) return 'Enter a start and end time.';
  // Times are editable to milliseconds; allow the rounded final timestamp.
  if (start < 0 || start >= duration || end > duration + 0.0005 * rate) return `Keep the range within the video (0–${(duration / rate).toFixed(3)} s).`;
  if (end <= start) return 'End must be after start.';
  if ((end - start) / rate > MAX_ANALYSIS_SECONDS + 0.000001) return 'Select up to 20 seconds per analysis. Move either handle to shorten the range.';
  return '';
}

export function createRangeSelector({ slots, state, seek, pause, changed }) {
  const $ = id => document.getElementById(id);
  const panel = $('rangeSelection');
  const current = () => slots[state().active];
  const format = value => Number.isFinite(value) ? value.toFixed(3) : '';
  function edit(field, value, { preview = false, preserveInputs = false } = {}) {
    const s = current();
    if (!s.ready || state().busy) return;
    s[field] = value;
    if (preview && Number.isFinite(value)) seek(value);
    render(preserveInputs); changed();
  }
  for (const [suffix, field] of [['Start', 'start'], ['End', 'end']]) {
    $(`range${suffix}`).oninput = e => edit(field, fileTime(e.target.valueAsNumber, current()), { preserveInputs: true });
    $(`range${suffix}Handle`).oninput = e => {
      const s = current(), gap = Math.min(fileTime(0.001, s), s.video.duration);
      // Both sliders use the full duration, so their positions share one scale.
      const min = field === 'end' && Number.isFinite(s.start) ? clamp(s.start + gap, gap, s.video.duration) : 0;
      const max = field === 'start' && Number.isFinite(s.end) ? clamp(s.end - gap, 0, s.video.duration - gap) : s.video.duration;
      edit(field, clamp(fileTime(e.target.valueAsNumber, s), min, max), { preview: true });
    };
    $(`rangeSet${suffix}`).onclick = () => { pause(); edit(field, current().video.currentTime); };
    $(`rangeGo${suffix}`).onclick = () => seek(current()[field]);
  }
  $('rangeReset').onclick = () => {
    const s = current(); if (!s.ready || state().busy) return;
    s.start = 0; edit('end', Math.min(fileTime(MAX_ANALYSIS_SECONDS, s), s.video.duration));
  };
  function render(preserveInputs = false) {
    const s = current(), { active, busy } = state(), duration = s.ready ? s.video.duration : 0;
    const error = s.ready ? analysisRangeError(s.start, s.end, duration, clipRate(s)) : '';
    const show = time => format(realTime(time, s));
    const name = active ? 'B' : 'A';
    panel.querySelectorAll('input,button').forEach(el => el.disabled = !s.ready || busy);
    $('cancelSelection').hidden = !busy; $('cancelSelection').disabled = !busy;
    $('rangeStatus').hidden = !s.analysisAttempted; $('rangeStatus').textContent = s.status;
    $('analyzeSelection').disabled = !s.ready || busy || !!error;
    $('rangeTarget').textContent = `Swing ${name}`;
    $('rangeClipDuration').textContent = `${show(duration)} s real`;
    for (const [suffix, field] of [['Start', 'start'], ['End', 'end']]) {
      const input = $(`range${suffix}`), handle = $(`range${suffix}Handle`);
      input.max = realTime(duration, s);
      input.title = 'Elapsed real seconds, using File FPS and Shot FPS';
      if (!preserveInputs) input.value = show(s[field]);
      input.setAttribute('aria-invalid', !!error);
      handle.max = realTime(duration, s) || 1;
      handle.value = Number.isFinite(s[field]) ? realTime(clamp(s[field], 0, duration), s) : 0;
      handle.setAttribute('aria-valuetext', `${show(s[field]) || 'Unset'} real seconds`);
      $(`rangeGo${suffix}`).disabled = !s.ready || busy || !Number.isFinite(s[field]) || s[field] < 0 || s[field] > duration + 0.0005 * clipRate(s);
    }
    const startPercent = duration && Number.isFinite(s.start) ? clamp(s.start / duration * 100, 0, 100) : 0;
    const endPercent = duration && Number.isFinite(s.end) ? clamp(s.end / duration * 100, 0, 100) : 0;
    $('rangeBand').style.left = `${startPercent}%`;
    $('rangeBand').style.width = `${Math.max(0, endPercent - startPercent)}%`;
    panel.classList.toggle('invalid-range', !!error);
    $('rangeError').hidden = !error; $('rangeError').textContent = error;
    $('rangeSummary').textContent = !s.ready ? 'Add a video to choose a range.' : error ? 'Adjust the selected range.' : `${show(s.end - s.start)} s selected`;
    $('analysisRangeSummary').textContent = !s.ready ? 'Add a video to select a range.' : error ? 'Adjust the selection in Range.' : `Swing ${name} · ${show(s.start)}–${show(s.end)} s`;
    $('rangeReset').textContent = realTime(duration, s) > MAX_ANALYSIS_SECONDS ? 'First 20 seconds' : 'Use full clip';
    const previous = s.analyzedRange;
    $('analyzedRangeNote').hidden = !previous || (previous[0] === s.start && previous[1] === s.end);
    $('analyzedRangeNote').textContent = previous ? `Results are for ${show(previous[0])}–${show(previous[1])} s. Analyze again to update them.` : '';
    renderPlayhead();
  }
  function renderPlayhead() {
    const s = current();
    $('rangePlayhead').hidden = !s.ready;
    $('rangePlayhead').style.left = `${s.ready ? clamp(s.video.currentTime / s.video.duration * 100, 0, 100) : 0}%`;
  }
  return { render, renderPlayhead };
}
