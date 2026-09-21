import { clamp, visible, measurements, frameTime, tempo, nearestSample, smoothSamples } from './analysis.js';
import { mediaRate, synchronization, realTime, fileTime, frameStamp, frameNumber, seconds, markedFrame } from './timing.js';
import { createMoments } from './moments.js';
import { PRIMARY_MOMENTS, suggestKeyMoments, keyMomentEntries } from './keyframes.js';
import { createKeyframeViews } from './keyframe-views.js';
import { createAnnotations } from './annotations.js';
import { createViewport } from './viewport.js';
import { createRangeSelector, analysisRangeError } from './range.js';
import { createStudioScreen } from './screen.js';
import { createTaskHelp, confirmDiscard } from './ux.js';
let annotations = null;
let rangeSelector = null;
let studioScreen = null;
let moments = null, keyframeViews = null;
const $ = id => document.getElementById(id);
const names = ['A', 'B'];
const frameRates = [23.976,24,25,29.97,30,50,59.94,60,100,120,240];
const phases = PRIMARY_MOMENTS;
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
let mode = 'single', active = 0, linked = true, offset = 0, aligned = false, job = null;
// With sync off, the common controller owns its last group command. Local
// controls release its live updates without changing the displayed state.
const commonTransport = { following: false, clock: 0, time: 0, duration: 1, rate: 1, fps: 30, speed: '1', playing: false };
const slots = names.map((name, index) => {
  const card = document.createElement('section');
  card.className = `video-card${index === 0 ? ' selected' : ''}`;
  card.dataset.slot = index;
  card.setAttribute('aria-label', `Swing ${name}`);
  card.innerHTML = `<div class="video-top"><span class="slot-badge">${name}</span><span class="file-name">${index ? 'Reference swing' : 'Your swing'}</span><button class="replace" hidden>Replace</button><button class="remove" aria-label="Remove swing ${name}" hidden>×</button></div>
    <div class="stage"><video muted playsinline preload="auto" hidden></video><canvas class="pose-canvas" hidden></canvas><button class="dropzone" aria-label="Add swing ${name} video"><span class="upload-icon">↥</span><strong>${index ? 'Reference swing' : 'Your swing'}</strong><span class="drop-description">${index ? 'Your earlier swing, or a swing to learn from.' : 'Drop your swing video here, or browse your files.'}</span><span class="upload-cta">Choose video <span aria-hidden="true">↗</span></span><span class="file-types">MP4 · MOV · WEBM / BROWSER-SUPPORTED VIDEO</span></button><span class="corner-label" hidden>LOCAL VIDEO · <span class="clip-time">0.00 s</span></span></div>
    <input class="file-input" type="file" accept="video/*,.mov,.mp4,.webm" hidden aria-label="Swing ${name} video file">
    <div class="video-bottom"><button class="clip-play" disabled aria-label="Play swing ${name}">▶ Play ${name}</button><button class="mirror" disabled aria-pressed="false">Mirror</button><label class="fps-label">FPS <select class="fps" aria-label="Swing ${name} file frame rate">${frameRates.map(n => `<option${n === 30 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="clip-transport" hidden aria-label="Independent swing ${name} controls"><div class="clip-timeline-row"><span>SWING ${name}</span><output class="clip-duration">0:00 / 0:00</output><button class="clip-restart" aria-label="Restart swing ${name}" title="Restart this video" disabled>↺</button></div><input class="clip-timeline" type="range" min="0" max="1" step="0.001" value="0" aria-label="Swing ${name} timeline" disabled><div class="clip-frame-controls"><button class="clip-previous" aria-label="Previous frame swing ${name}" title="Previous frame" disabled>Ⅰ‹</button><button class="clip-next" aria-label="Next frame swing ${name}" title="Next frame" disabled>›Ⅰ</button><label>Speed <select class="clip-speed" aria-label="Swing ${name} playback speed" disabled>${[0.25,0.5,1,1.5].map(n => `<option value="${n}"${n === 1 ? ' selected' : ''}>${n}×</option>`).join('')}</select></label></div></div>
    <div class="clip-timing" aria-label="Swing ${name} video timing"><label class="shot-fps-label" title="Camera recording rate. Leave Same for normal-speed files; choose the original recording FPS for a slow-motion export.">Shot FPS <select class="shot-fps" aria-label="Swing ${name} recording frame rate"><option value="same">Same</option>${frameRates.map(n => `<option value="${n}">${n}</option>`).join('')}</select></label></div>`;
  $('videoGrid').append(card);
  // Controls keep their identity when the screen layout moves them into a panel.
  const controlCache = new Map();
  const get = selector => { const element = card.querySelector(selector); if (element) controlCache.set(selector, element); return element || controlCache.get(selector); };
  const slot = { card, video: get('video'), canvas: get('canvas'), stage: get('.stage'), input: get('.file-input'), drop: get('.dropzone'), get, ready: false, url: null, version: 0, playGeneration: 0, fps: 30, shotFps: null, speed: 1, hand: 'right', samples: [], keyMoments: [], analysisVersion: 0, marks: {}, anchor: null, start: 0, end: 0, tolerance: 0.1, status: 'Add a video to get started.' };
  slot.drop.onclick = () => slot.input.click();
  get('.replace').onclick = () => slot.input.click();
  get('.remove').onclick = async () => { if (await confirmDiscard(slot, 'Remove', hasSavedWork(slot, index))) resetSlot(index); };
  slot.input.onchange = () => { if (slot.input.files[0]) loadFile(index, slot.input.files[0]); };
  for (const type of ['dragenter', 'dragover']) slot.stage.addEventListener(type, e => { e.preventDefault(); slot.drop.classList.add('dragover'); });
  slot.stage.addEventListener('dragleave', () => slot.drop.classList.remove('dragover'));
  slot.stage.addEventListener('drop', e => { e.preventDefault(); slot.drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) loadFile(index, e.dataTransfer.files[0]); });
  get('.clip-play').onclick = () => controlClip(index, togglePlay);
  get('.clip-timeline').oninput = e => { const time = fileTime(Number(e.target.value),slot); controlClip(index, () => seekActive(time)); };
  get('.clip-previous').onclick = () => controlClip(index, () => step(-1));
  get('.clip-next').onclick = () => controlClip(index, () => step(1));
  get('.clip-restart').onclick = () => controlClip(index, () => seekActive(0));
  get('.clip-speed').onchange = e => { const speed = Number(e.target.value); controlClip(index, () => setSpeed(speed)); };
  get('.mirror').onclick = () => { const on = slot.stage.classList.toggle('mirrored'); get('.mirror').setAttribute('aria-pressed', on); render(); };
  get('.fps').onchange = e => configureTiming(index, Number(e.target.value), slot.shotFps);
  get('.shot-fps').onchange = e => configureTiming(index, slot.fps, e.target.value === 'same' ? null : Number(e.target.value));
  card.addEventListener('click', e => { if (!e.target.closest('button,input,select')) selectSlot(index); });
  slot.video.addEventListener('timeupdate', () => { if (!job) render(); });
  slot.video.addEventListener('seeked', () => { if (!job) render(); });
  slot.video.addEventListener('ended', () => { if (isLinked()) pauseAll(); updatePlayback(); });
  slot.video.addEventListener('play', updatePlayback);
  slot.video.addEventListener('pause', updatePlayback);
  return slot;
});
for (const [index, [key, name]] of phases.entries()) {
  const row = document.createElement('div'); row.className = 'phase-row';
  row.innerHTML = `<span class="phase-number">0${index + 1}</span><span>${name}</span><button class="phase-time" id="phase-${key}" aria-label="Go to ${name}" disabled>—</button><button id="mark-${key}" aria-label="Mark ${name}" disabled>+ Mark</button>`;
  $('phases').append(row);
  $(`mark-${key}`).onclick = () => { pauseControlled(); slots[active].marks[key] = markedFrame(slots[active].video.currentTime,slots[active]); updatePhases(); };
  $(`phase-${key}`).onclick = () => seekActive(slots[active].marks[key]);
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
function timingClips() { return slots.map(s => ({duration:s.video.duration, fps:s.fps, shotFps:s.shotFps ?? s.fps})); }
function timingRate(s) { return mediaRate(s.fps, s.shotFps ?? s.fps); }
function syncModel() { return synchronization(timingClips(), offset); }
function syncOffset() { return (slots[1].anchor ?? 0) / timingRate(slots[1]) - (slots[0].anchor ?? 0) / timingRate(slots[0]); }
function applySpeed(s) { s.video.playbackRate = s.speed * timingRate(s); }
function configureTiming(index, fps, shotFps) {
  if (job) return;
  const s = slots[index], previousRate = timingRate(s);
  s.fps = fps; s.shotFps = shotFps && shotFps >= fps ? shotFps : null;
  s.get('.fps').value = String(fps);
  s.get('.shot-fps').value = s.shotFps ? String(s.shotFps) : 'same';
  for (const option of s.get('.shot-fps').options) option.disabled = option.value !== 'same' && Number(option.value) < fps;
  if (timingRate(s) !== previousRate) {
    pauseControlled(index);
    offset = syncOffset();
    applySpeed(s);
    if (isLinked()) seekActive(s.video.currentTime, index);
  }
  update();
}
function isLinked() { return mode === 'compare' && linked && slots.every(s => s.ready); }
function isIndependent() { return mode === 'compare' && !linked; }
function playerState(clock) {
  const s = slots[clock], both = mode === 'compare';
  return { clock, time: s.video.currentTime || 0, duration: s.ready ? s.video.duration : 0, rate: timingRate(s), fps: s.fps,
    speed: both && slots[0].speed !== slots[1].speed ? 'mixed' : String(s.speed),
    playing: both ? slots.some(slot => !slot.video.paused) : !s.video.paused };
}
function commonState() {
  if (!isIndependent()) return playerState(active);
  if (commonTransport.following) Object.assign(commonTransport, playerState(commonTransport.clock));
  return commonTransport;
}
function releaseCommon() {
  if (!isIndependent()) return;
  commonState(); commonTransport.following = false;
}
function pauseSlots(targets) { targets.forEach(s => { s.playGeneration++; s.video.pause(); }); }
function pauseAll() { pauseSlots(slots); }
function pauseControlled(index = active) { releaseCommon(); pauseSlots(isLinked() ? slots : [slots[index]]); }
function setSpeed(speed, both = false) {
  if (both && isIndependent()) commonTransport.following = true;
  (isLinked() || (both && mode === 'compare') ? slots : [slots[active]]).forEach(s => { s.speed = speed; applySpeed(s); });
  update();
}
function setLinked(next) {
  if (job || linked === next) return;
  if (next) pauseAll();
  // Unlink without interrupting playback; pending group play requests no longer own both clips.
  else slots.forEach(s => s.playGeneration++);
  linked = next;
  if (!next) Object.assign(commonTransport, playerState(active), { following: false });
  if (isLinked()) { setSpeed(slots[active].speed); seekActive(slots[active].video.currentTime); }
  update();
}
// Individual playback is always scoped to its own clip. View changes do not unlink.
function controlClip(index, action) {
  if (job || !slots[index].ready) return;
  if (mode === 'compare' && linked) {
    setLinked(false);
    toast(`Sync off · controlling swing ${names[index]}. Use the bottom controller for both.`);
  }
  releaseCommon(); selectSlot(index); action();
}
function invalidateSync() { offset = 0; aligned = false; slots.forEach(s => s.anchor = null); }
function hasSavedWork(s, index) { return !!(s.samples.length || Object.keys(s.marks).length || annotations?.count(index)); }
function resetSlot(index) {
  if (job) return;
  pauseControlled(index); const s = slots[index]; s.version++; s.ready = false; s.video.onerror = null;
  s.video.removeAttribute('src'); s.video.load();
  if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, { url: null, samples: [], keyMoments: [], analyzedRange: null, analysisAttempted: false, marks: {}, anchor: null, start: 0, end: 0, rangeAuto: true, windowCenter: 0, windowSpan: 0, status: 'Add a video to get started.' });
  s.fps = 30; s.shotFps = null; s.speed = 1;
  s.get('.fps').value = '30'; s.get('.shot-fps').value = 'same';
  for (const option of s.get('.shot-fps').options) option.disabled = option.value !== 'same' && Number(option.value) < 30;
  applySpeed(s);
  s.input.value = ''; s.get('.file-name').textContent = index ? 'Reference swing' : 'Your swing';
  s.video.hidden = true; s.drop.hidden = false; s.canvas.hidden = true;
  s.stage.classList.remove('mirrored'); s.get('.mirror').setAttribute('aria-pressed', false);
  s.viewport?.reset(); annotations?.reset(index); invalidateSync(); update();
}
async function loadFile(index, file) {
  if (job) return toast('Finish or cancel analysis before replacing a video.');
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name)) return toast('Choose a video file, such as MP4, MOV or WebM.');
  const s = slots[index];
  if (!await confirmDiscard(s, 'Replace', hasSavedWork(s, index))) { s.input.value = ''; return; }
  if (job) return;
  resetSlot(index); const version = s.version;
  s.status = 'Opening your video…'; s.get('.file-name').textContent = file.name;
  s.url = URL.createObjectURL(file); s.video.src = s.url;
  selectSlot(index);
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); s.video.removeEventListener('loadeddata', loaded); s.video.removeEventListener('error', error); };
      const loaded = () => { cleanup(); resolve(); };
      const error = () => { cleanup(); reject(new Error('This video could not be decoded. Try an H.264 MP4 or WebM file.')); };
      const timer = setTimeout(error, 20000);
      s.video.addEventListener('loadeddata', loaded); s.video.addEventListener('error', error);
    });
    if (s.version !== version) return;
    if (!Number.isFinite(s.video.duration) || s.video.duration <= 0 || !s.video.videoWidth) throw new Error('This video has no readable duration. Try exporting it as an MP4.');
    s.ready = true; s.video.hidden = false; s.drop.hidden = true;
    if (isLinked()) { s.speed = slots[1 - index].speed; applySpeed(s); }
    if (isIndependent()) Object.assign(commonTransport, playerState(active), { following: false });
    s.status = 'Pause at your swing, then Analyze. The window follows the current frame ±5 seconds.';
    s.video.onerror = () => { if (s.ready) { pauseControlled(index); s.status = 'Video decoding failed. Replace this clip with an H.264 MP4.'; s.ready = false; update(); } };
    update(); studioScreen?.focus();
  } catch (error) {
    if (s.version !== version) return;
    resetSlot(index); s.status = error.message; update(); toast(error.message);
  }
}
function setMode(next) {
  if (job) return;
  slots.forEach(s => s.viewport?.cancelGesture()); annotations?.interrupt(); pauseAll(); mode = next; if (mode === 'single') active = 0;
  if (isIndependent()) Object.assign(commonTransport, playerState(active), { following: false });
  $('singleMode').setAttribute('aria-pressed', mode === 'single'); $('compareMode').setAttribute('aria-pressed', mode === 'compare');
  $('comparisonBar').hidden = $('analysisTarget').hidden = mode !== 'compare';
  $('videoGrid').classList.toggle('compare', mode === 'compare');
  slots[1].card.hidden = mode !== 'compare';
  if (isLinked()) { setSpeed(slots[active].speed); seekActive(slots[active].video.currentTime); }
  $('modeCaption').textContent = mode === 'compare' ? 'Same moment. A new perspective.' : 'A little perspective goes a long way.';
  update();
}
function selectSlot(index) { if (job) return; if (active !== index) annotations?.interrupt(); active = index; update(); }
function updatePlayback() {
  if (!slots.length) return;
  const both = mode === 'compare';
  const playing = commonState().playing;
  const action = playing ? 'Pause' : 'Play', target = both ? 'both swings' : `swing ${names[active]}`;
  $('play').innerHTML = `<span aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span><span class="play-word">${action} ${both ? 'both' : names[active]}</span>`;
  $('play').setAttribute('aria-label', `${action} ${target}`);
  slots.forEach((s, i) => {
    const paused = s.video.paused;
    s.get('.clip-play').textContent = `${paused ? '▶ Play' : 'Ⅱ Pause'} ${names[i]}`;
    s.get('.clip-play').dataset.shortLabel = `${paused ? '▶' : 'Ⅱ'} ${names[i]}`;
    s.get('.clip-play').setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} swing ${names[i]}`);
  });
}
function updateAnalysisControls() {
  const s = slots[active];
  const disabled = !s.ready || !!job || !!analysisRangeError(s.start, s.end, s.video.duration, timingRate(s));
  $('analyze').disabled = $('analyzeSelection').disabled = disabled;
  const target = mode === 'compare' ? ` ${names[active]}` : '';
  $('analyze').textContent = `Analyze${target}`;
  const range = s.ready ? Number.isFinite(s.start) && Number.isFinite(s.end) ? `${seconds(realTime(s.start,s))}–${seconds(realTime(s.end,s))} s` : 'set range' : 'no video';
  $('analyze').title = `Analyze swing ${names[active]} · ${range}`;
  $('reviewContext').textContent = `Swing ${names[active]} · ${range}`;
  $('reviewContext').disabled = !s.ready || !!job;
  if (s.ready && !s.analysisAttempted) $('status').textContent = analysisRangeError(s.start,s.end,s.video.duration,timingRate(s)) || (s.rangeAuto !== false ? 'Pause at your swing, then Analyze.' : 'Ready. Analyze your pinned window.');
}
function update() {
  const s = slots[active], busy = !!job;
  for (const id of ['singleMode','compareMode','linked','independent','hand','speed']) $(id).disabled = busy;
  document.querySelectorAll('[data-select]').forEach(b => { b.disabled = busy; b.setAttribute('aria-pressed', Number(b.dataset.select) === active); });
  slots.forEach((slot, i) => {
    slot.card.classList.toggle('selected', i === active);
    for (const selector of ['.clip-play','.mirror','.clip-timeline','.clip-previous','.clip-next','.clip-speed','.clip-restart']) slot.get(selector).disabled = !slot.ready || busy;
    slot.get('.clip-transport').hidden = mode !== 'compare';
    slot.get('.clip-speed').value = String(slot.speed);
    slot.get('.fps').disabled = slot.get('.shot-fps').disabled = !slot.ready || busy;
    slot.get('.replace').hidden = slot.get('.remove').hidden = !slot.ready;
    slot.get('.replace').disabled = slot.get('.remove').disabled = busy;
    slot.drop.disabled = busy; slot.get('.corner-label').hidden = !slot.ready;
  });
  const commonReady = mode === 'compare' ? slots.every(slot => slot.ready) : s.ready;
  for (const id of ['play','previous','next','restart','timeline','speed']) $(id).disabled = !commonReady || busy;
  $('clearMarks').disabled = !s.ready || busy;
  $('export').disabled = busy || !s.ready;
  $('align').disabled = busy || !slots.every(x => x.ready);
  $('cancel').hidden = !busy; $('progress').hidden = !busy;
  $('hand').value = s.hand;
  $('status').textContent = s.status; $('activeLabel').textContent = mode === 'compare' ? 'BOTH' : 'SWING A';
  for (const [id, label] of [['previous','Previous frame'],['next','Next frame'],['restart','Restart'],['speed','Playback speed']]) $(id).setAttribute('aria-label', `${label} ${mode === 'compare' ? 'both swings' : 'swing A'}`);
  $('restart').innerHTML = '<span aria-hidden="true">↺</span><span class="restart-word"> Restart</span>';
  $('linked').setAttribute('aria-pressed', linked); $('independent').setAttribute('aria-pressed', !linked);
  $('syncHint').textContent = !linked ? 'Individual controls leave the common controller unchanged.' : aligned ? `Aligned · B offset ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} real s` : 'Sync is locked. Individual controls turn sync off.';
  const model = isLinked() ? syncModel() : null;
  for (const id of ['previous','next']) $(id).title = model ? `Step both by ${(model.stepSeconds * 1000).toFixed(2)} ms of real time, using both frame rates` : `${id === 'next' ? 'Next' : 'Previous'} frame`;
  $('align').title = `Sync the displayed frames using each video's File FPS and Shot FPS. Use Sync off to position them first.`;
  rangeSelector?.render(); updateAnalysisControls(); updatePhases(); updatePlayback(); render();
}
function updatePhases() {
  const s = slots[active];
  for (const [key] of phases) {
    const time = s.marks[key]; $(`phase-${key}`).textContent = time === undefined ? '—' : `${seconds(realTime(time,s))} s`;
    $(`phase-${key}`).title = time === undefined ? 'Not marked' : frameStamp(time,s);
    $(`phase-${key}`).disabled = time === undefined || !!job; $(`mark-${key}`).disabled = !s.ready || !!job;
    $(`mark-${key}`).textContent = time === undefined ? '+ Mark' : 'Update';
  }
  const ratio = tempo(s.marks); $('tempo').textContent = ratio === null ? '—' : `${ratio.toFixed(2)} : 1`;
  $('tempoNote').textContent = ratio !== null ? `${seconds(realTime(s.marks.top - s.marks.address,s))} s backswing / ${seconds(realTime(s.marks.impact - s.marks.top,s))} s downswing. Real time from your marks.` : ['address','top','impact'].every(k => k in s.marks) ? 'Marks must follow this order: address → top → impact.' : 'Mark address, top and impact to measure your tempo.';
  $('export').disabled = !!job || !s.ready;
  moments?.render();
  keyframeViews?.render(JSON.stringify(slots.map((s,i)=>annotations?.data(i))));
}
function seekActive(time, reference = active) {
  if (!Number.isFinite(time) || job || !slots[active].ready) return;
  pauseControlled();
  if (isLinked()) {
    const model = syncModel();
    if (!model) return toast('These sync points have no shared playback range. Choose new sync frames.');
    const targets = model.mediaTimes(model.commonTime(time, reference));
    slots.forEach((slot, i) => slot.video.currentTime = targets[i]);
  } else slots[active].video.currentTime = clamp(time, 0, slots[active].video.duration);
  render();
}
function seekRangeBoundary(time) {
  const s = slots[active];
  if (!s.ready || job || !Number.isFinite(time)) return;
  pauseControlled();
  // An analysis range may extend beyond the synchronized clips' shared range.
  // Preview the selected clip's exact boundary; keep the companion as close as possible.
  s.video.currentTime = clamp(time, 0, s.video.duration);
  if (isLinked()) {
    const other = slots[1 - active];
    const common = s.video.currentTime / timingRate(s) - (active ? offset : 0);
    other.video.currentTime = clamp((common + (active ? 0 : offset)) * timingRate(other), 0, other.video.duration);
  }
  render();
}
async function togglePlay(both = false) {
  if (job || !slots[active].ready || (both && mode === 'compare' && !slots.every(s => s.ready))) return;
  const targets = isLinked() || (both && mode === 'compare') ? slots : [slots[active]];
  const shouldPause = both && isIndependent() ? commonState().playing : targets.some(s => !s.video.paused);
  if (both && isIndependent()) commonTransport.following = true;
  if (shouldPause) { pauseSlots(targets); updatePlayback(); render(); return; }
  if (isLinked()) {
    const model = syncModel();
    if (!model) return toast('No shared playback range. Choose new sync frames.');
    let time = model.commonTime(slots[0].video.currentTime, 0);
    if (time < model.bounds.start || time >= model.bounds.end - model.endTolerance) time = model.bounds.start;
    const targets = model.mediaTimes(time);
    slots.forEach((s, i) => s.video.currentTime = targets[i]);
  } else targets.forEach(s => { if (s.video.ended || s.video.currentTime >= s.video.duration - 0.02) s.video.currentTime = 0; });
  const generations = targets.map(s => ++s.playGeneration);
  const results = await Promise.allSettled(targets.map(s => s.video.play()));
  if (results.some((r, i) => r.status === 'rejected' && generations[i] === targets[i].playGeneration)) {
    pauseSlots(targets.filter((s, i) => generations[i] === s.playGeneration));
    toast('Playback could not start. Try pressing Play again or use another video format.');
  }
  updatePlayback();
}
function step(direction) { const s = slots[active]; if (s.ready) seekActive(frameTime(s.video.currentTime, direction, s.fps, 0, s.video.duration)); }
// Shared commands remain available with sync off, preserving individual speeds
// and relative playheads until a clip reaches its own boundary.
function seekBoth(time) {
  if (mode !== 'compare' || isLinked()) return seekActive(time);
  if (job || !Number.isFinite(time) || !slots.every(s => s.ready)) return;
  const delta = time - slots[commonTransport.clock].video.currentTime;
  commonTransport.following = true;
  pauseAll();
  slots.forEach(s => { s.video.currentTime = clamp(s.video.currentTime + delta, 0, s.video.duration); });
  updatePlayback(); render();
}
function stepBoth(direction) {
  if (mode !== 'compare') return step(direction);
  if (job || !slots.every(s => s.ready)) return;
  if (isIndependent()) commonTransport.following = true;
  pauseAll();
  if (isLinked()) {
    const targets = syncModel()?.step(slots.map(s => s.video.currentTime), direction);
    if (targets) slots.forEach((s, i) => s.video.currentTime = targets[i]);
  } else slots.forEach(s => { s.video.currentTime = frameTime(s.video.currentTime, direction, s.fps, 0, s.video.duration); });
  updatePlayback(); render();
}
function restartBoth() {
  if (mode !== 'compare' || isLinked()) return seekActive(0);
  if (job || !slots.every(s => s.ready)) return;
  commonTransport.following = true;
  pauseAll(); slots.forEach(s => { s.video.currentTime = 0; }); updatePlayback(); render();
}
function render() {
  const s = slots[active];
  studioScreen?.update();
  slots.forEach(slot => slot.viewport?.apply());
  const controller = commonState(), clockName = mode === 'compare' ? names[controller.clock] + ' ' : '';
  const elapsed = controller.time / controller.rate, duration = controller.duration / controller.rate;
  $('timeline').max = duration || 1; $('timeline').value = elapsed;
  const frame = frameNumber(controller.time,controller.fps,controller.duration);
  $('timeline').setAttribute('aria-valuetext',`${seconds(elapsed)} real seconds, frame ${frame}`);
  $('timeline').setAttribute('aria-label', mode === 'compare' ? `Both videos timeline, swing ${names[controller.clock]} clock` : 'Swing A timeline');
  $('timeline').title = mode === 'compare' ? `Seek both by the same time change. Clock: swing ${names[controller.clock]}.` : 'Seek swing A';
  $('speed').value = controller.speed;
  $('time').dataset.shortTime = `${clockName}${seconds(elapsed)} s · F${frame}`;
  $('time').textContent = `${clockName}${seconds(elapsed)} / ${seconds(duration)} s`;
  $('time').title = `${seconds(elapsed)} real seconds · Frame ${frame} (first frame is 0)`;
  slots.forEach(slot => {
    slot.get('.clip-timeline').max = slot.ready ? realTime(slot.video.duration,slot) : 1;
    slot.get('.clip-timeline').value = realTime(slot.video.currentTime || 0,slot);
    slot.get('.clip-timeline').setAttribute('aria-valuetext',frameStamp(slot.video.currentTime || 0,slot));
    slot.get('.clip-duration').textContent = `${seconds(realTime(slot.video.currentTime,slot))} / ${seconds(realTime(slot.ready ? slot.video.duration : 0,slot))} s`;
    slot.get('.clip-duration').title = 'Elapsed / total real seconds, using File FPS and Shot FPS';
  });
  slots.forEach((slot, i) => { if (slot.ready && (mode === 'compare' || i === 0)) draw(slot, i); });
  const sample = nearestSample(s.samples, s.video.currentTime, s.tolerance);
  const values = measurements(sample?.points, s.video.videoWidth, s.video.videoHeight, s.hand);
  for (const key of ['elbow','knee','lean']) $(key).innerHTML = `${values[key] === null ? '—' : Math.round(values[key])}<small>°</small>`;
  const count = s.samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
  $('coverage').innerHTML = `${s.samples.length ? Math.round(count / s.samples.length * 100) : '—'}<small>%</small>`;
  annotations?.render();
  rangeSelector?.renderPlayhead();
  keyframeViews?.render(JSON.stringify(slots.map((s,i)=>annotations?.data(i))));
}
function draw(s, index) {
  s.get('.clip-time').textContent = frameStamp(s.video.currentTime,s);
  s.get('.clip-time').title = 'Elapsed real seconds and frame number (first frame is 0)';
  const scale = Math.min(s.stage.clientWidth / s.video.videoWidth, s.stage.clientHeight / s.video.videoHeight);
  const w = Math.max(1, Math.round(s.video.videoWidth * scale)), h = Math.max(1, Math.round(s.video.videoHeight * scale));
  const canvas = s.canvas; if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.hidden = false; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,w,h);
  if ($('guideLines').checked) { ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = 1; for (const f of [1/3,2/3]) { ctx.beginPath(); ctx.moveTo(w*f,0); ctx.lineTo(w*f,h); ctx.moveTo(0,h*f); ctx.lineTo(w,h*f); ctx.stroke(); } }
  const sample = nearestSample(s.samples, s.video.currentTime, s.tolerance), points = sample?.points;
  const color = index === 0 ? '#d6ee9c' : '#9ecdf2';
  if ($('trail').checked) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); let pen = false;
    for (const frame of s.samples) {
      if (frame.time > s.video.currentTime || frame.time < s.video.currentTime - fileTime(1.5,s)) continue;
      const p = frame.points?.[s.hand === 'right' ? 15 : 16];
      if (!visible(p)) { pen = false; continue; }
      if (!pen) ctx.moveTo(p.x*w,p.y*h); else ctx.lineTo(p.x*w,p.y*h); pen = true;
    }
    ctx.stroke();
  }
  if (!points || !$('skeleton').checked) return;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (const [a,b] of connections) { if (!visible(points[a]) || !visible(points[b])) continue; ctx.beginPath(); ctx.moveTo(points[a].x*w,points[a].y*h); ctx.lineTo(points[b].x*w,points[b].y*h); ctx.stroke(); }
  for (const i of new Set(connections.flat())) { const p = points[i]; if (!visible(p)) continue; ctx.beginPath(); ctx.arc(p.x*w,p.y*h,3,0,Math.PI*2); ctx.fillStyle = color; ctx.fill(); }
}
function playbackLoop() {
  if (!job) {
    if (isLinked() && !slots[0].video.paused) {
      const a = slots[0].video, b = slots[1].video, model = syncModel();
      const time = model?.commonTime(a.currentTime, 0);
      if (!model || time >= model.bounds.end - model.endTolerance) pauseAll();
      else if (a.readyState < 3 || b.readyState < 3) { /* Wait for decoding before correcting drift. */ }
      else if (Math.abs(model.commonTime(b.currentTime, 1) - time) > model.driftTolerance && !b.seeking) b.currentTime = model.mediaTimes(time)[1];
    }
    if (slots.some(s => s.ready && !s.video.paused)) render();
  }
  requestAnimationFrame(playbackLoop);
}
const yieldFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
async function seekDecoded(video, time) {
  if (Math.abs(video.currentTime - time) < 0.0001 && video.readyState >= 2 && !video.seeking) return;
  await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Could not decode a frame. Try a shorter range or an H.264 MP4.')); };
    const timer = setTimeout(fail, 10000); video.addEventListener('seeked', done); video.addEventListener('error', fail); video.currentTime = time;
  });
}
// Cancel immediately even while a CDN or model request is stalled. If model
// initialization completes after cancellation, release its resources as well.
function modelOperation(promise, token, release = () => {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const signal = token.controller.signal;
    const finish = (error, value) => {
      if (settled) { if (!error) release(value); return; }
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(new Error('Analysis cancelled.'));
    const timer = setTimeout(() => finish(new Error('Model download timed out.')), 45000);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => finish(null, value), error => finish(error));
    if (signal.aborted) abort();
  });
}
async function analyze() {
  const s = slots[active]; if (!s.ready || job) return;
  // Freeze the playhead before selecting the automatic window so the restored
  // frame and analyzed interval have the same anchor, even during playback.
  pauseAll();
  // Refresh at the click, not at a previous playback/render tick. Pinned ranges
  // remain exactly as the user chose them throughout scanning and cancellation.
  rangeSelector.prepare();
  const start = s.start, end = s.end, rangeError = analysisRangeError(start, end, s.video.duration, timingRate(s));
  if (rangeError) return toast(rangeError);
  s.start = start; s.end = Math.min(end, s.video.duration); s.analysisAttempted = true;
  const originalTime = s.video.currentTime; const token = { cancelled: false, controller: new AbortController() }; job = token;
  s.status = 'Loading the on-device pose model…'; $('progress').value = 0; update();
  let detector;
  try {
    const { FilesetResolver, PoseLandmarker } = await modelOperation(import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs'), token);
    if (token.cancelled) return;
    const vision = await modelOperation(FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'), token);
    if (token.cancelled) return;
    // A fresh model per run prevents tracking state leaking between videos.
    detector = await modelOperation(PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
    }), token, lateDetector => lateDetector.close());
    if (token.cancelled) return;
    const duration = s.end - start, count = Math.min(240, Math.max(2, Math.ceil(duration * Math.min(s.fps, 30))));
    const interval = duration / count, samples = [];
    const buffer = document.createElement('canvas'); const scale = Math.min(1, 640 / Math.max(s.video.videoWidth,s.video.videoHeight));
    buffer.width = Math.round(s.video.videoWidth * scale); buffer.height = Math.round(s.video.videoHeight * scale); const ctx = buffer.getContext('2d');
    for (let i = 0; i < count; i++) {
      if (token.cancelled) break;
      const time = start + i * interval;
      await seekDecoded(s.video, time);
      if (token.cancelled) break;
      ctx.drawImage(s.video,0,0,buffer.width,buffer.height);
      const result = detector.detectForVideo(buffer, realTime(i * interval,s) * 1000 + 1);
      samples.push({ time, points: result.landmarks[0]?.map(p => ({ x: p.x, y: p.y, visibility: p.visibility })) ?? null });
      $('progress').value = (i + 1) / count; s.status = `Looking closer… ${Math.round((i + 1) / count * 100)}% · ${i + 1} / ${count} samples`; $('status').textContent = $('rangeStatus').textContent = s.status;
      await yieldFrame();
    }
    if (!token.cancelled) {
      s.samples = smoothSamples(samples); s.tolerance = interval * 0.6;
      s.analyzedRange = [start, s.end];
      s.keyMoments = suggestKeyMoments(s.samples,start,s.end,s.fps); s.analysisVersion++;
      const valid = samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
      s.status = valid === 0 ? 'No clear pose found. Try a well-lit clip with your whole body visible.' : `Analysis ready · ${samples.length} samples. ${valid / samples.length < 0.5 ? 'Low pose coverage: try better lighting or a clearer view.' : 'Your key-moment previews are beside the player. Click a frame to review it.'}`;
    }
  } catch (error) {
    if (!token.cancelled) console.error('Pose analysis failed:', error);
    s.status = 'Analysis unavailable. Check your connection and retry; if it persists, try a current Chrome or Safari browser. Video comparison still works.';
  } finally {
    detector?.close();
    if (token.cancelled) s.status = 'Analysis cancelled. Your previous results are preserved.';
    try { await seekDecoded(s.video, originalTime); } catch { /* The file may no longer be decodable. */ }
    job = null; update();
  }
}
$('singleMode').onclick = () => setMode('single'); $('compareMode').onclick = () => setMode('compare');
document.querySelectorAll('[data-select]').forEach(b => b.onclick = () => selectSlot(Number(b.dataset.select)));
$('linked').onclick = () => setLinked(true); $('independent').onclick = () => setLinked(false);
$('align').onclick = () => {
  if (job || !slots.every(s => s.ready)) return;
  pauseAll();
  const next = slots[1].video.currentTime / timingRate(slots[1]) - slots[0].video.currentTime / timingRate(slots[0]);
  if (!synchronization(timingClips(), next)) return toast('Choose frames with video remaining in both clips.');
  slots.forEach(s => { s.anchor = s.video.currentTime; });
  offset = next; aligned = true; linked = true;
  setSpeed(slots[active].speed);
  slots.forEach(s => { s.video.currentTime = s.anchor; });
  update(); toast('Aligned to these frames. Play both to compare.');
};
$('timeline').oninput = e => seekBoth(Number(e.target.value) * commonState().rate); $('play').onclick = () => togglePlay(true);
$('previous').onclick = () => stepBoth(-1); $('next').onclick = () => stepBoth(1); $('restart').onclick = restartBoth;
$('speed').onchange = e => setSpeed(Number(e.target.value), true);
$('hand').onchange = e => { slots[active].hand = e.target.value; render(); };
for (const id of ['skeleton','trail','guideLines']) $(id).onchange = render;
$('clearMarks').onclick = () => { slots[active].marks = {}; updatePhases(); };
$('analyze').onclick = $('analyzeSelection').onclick = analyze; $('cancel').onclick = $('cancelSelection').onclick = () => { if (job) { job.cancelled = true; job.controller.abort(); $('status').textContent = $('rangeStatus').textContent = 'Cancelling… finishing the current model operation.'; } };
// Shared report model: timestamps remain in media seconds internally so
// drawings and analyzed samples stay attached to their original frames.
export function reportData(index = active) {
  const s = slots[index];
  const values = time => measurements(nearestSample(s.samples,time,s.tolerance)?.points,s.video.videoWidth,s.video.videoHeight,s.hand);
  const valid = s.samples.filter(sample=>sample.points && [11,12,23,24].every(i=>visible(sample.points[i]))).length;
  return { name:names[index], file:s.get('.file-name').textContent, hand:s.hand,
    frameRate:s.fps, recordingFrameRate:s.shotFps ?? s.fps, mediaSecondsPerRealSecond:timingRate(s),
    viewport:s.viewport.state(), mirrored:s.stage.classList.contains('mirrored'), drawings:annotations.data(index),
    currentTime:s.video.currentTime, duration:s.video.duration, currentMeasurements:values(s.video.currentTime),
    range:s.analyzedRange || [s.start,s.end], selectedRange:[s.start,s.end], analyzedRange:s.analyzedRange ?? null,
    marks:{...s.marks}, keyMoments:keyMomentEntries(s), tempo:tempo(s.marks), coverage:s.samples.length ? Math.round(valid/s.samples.length*100) : 0,
    momentMeasurements:Object.fromEntries(phases.map(([key])=>[key,values(s.marks[key])])),
    measurements:s.samples.map(sample=>({time:sample.time,realSeconds:realTime(sample.time,s),frame:frameNumber(sample.time,s.fps),...values(sample.time)})),
  };
}
const reportDialog = document.createElement('dialog');
reportDialog.id='reportDialog';reportDialog.className='report-dialog';reportDialog.setAttribute('aria-labelledby','reportTitle');
reportDialog.innerHTML='<h2 id="reportTitle">Making your PDF report</h2><p role="status">Preparing annotated frames…</p><button>Cancel</button>';
document.body.append(reportDialog);
const cancelReport=()=>{if(job?.kind==='report')job.cancelled=true;};
reportDialog.querySelector('button').onclick=cancelReport;
reportDialog.addEventListener('cancel',event=>{event.preventDefault();cancelReport();});
$('export').onclick = async () => {
  if(job || !slots[active].ready)return;
  pauseAll();annotations.interrupt();updatePlayback();render();
  const indices=(mode==='compare'?[0,1]:[active]).filter(i=>slots[i].ready);
  const originals=slots.map(s=>s.video.currentTime),savedCommon={...commonTransport};
  const report={created:new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}),linked:isLinked(),clips:indices.map(reportData)};
  const token={kind:'report',cancelled:false,controller:new AbortController()};job=token;update();reportDialog.showModal();
  try {
    const {createPdfReport}=await import('./report.js');
    for(const [column,index] of indices.entries()) {
      const s=slots[index],clip=report.clips[column];
      await seekDecoded(s.video,originals[index]);render();
      clip.currentImage=annotations.capture(index,indices.length===2?688:1424,800).toDataURL('image/jpeg',.92);
      clip.momentImages={};
      for(const [key,label] of phases) {
        if(token.cancelled)return;
        if(!Number.isFinite(s.marks[key]))continue;
        reportDialog.querySelector('p').textContent=`Preparing swing ${names[index]}: ${label.toLowerCase()}…`;
        await seekDecoded(s.video,s.marks[key]);render();
        clip.momentImages[key]=annotations.capture(index,1020,660).toDataURL('image/jpeg',.92);
      }
      clip.visualMoments = (s.keyMoments.length || Number.isFinite(s.marks.downswing) || Number.isFinite(s.marks.follow)) ? clip.keyMoments.filter(entry=>Number.isFinite(entry.time)) : [];
      for(const entry of clip.visualMoments) {
        if(token.cancelled)return;
        reportDialog.querySelector('p').textContent=`Preparing swing ${names[index]}: ${entry.label.toLowerCase()}…`;
        await seekDecoded(s.video,entry.time);render();
        entry.image=annotations.capture(index,1020,600).toDataURL('image/jpeg',.92);
      }
    }
    if(token.cancelled)return;
    reportDialog.querySelector('p').textContent='Laying out your report…';
    const blob=await createPdfReport(report);
    if(token.cancelled)return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download=indices.length===2?'swing-comparison-report.pdf':`swing-${names[indices[0]].toLowerCase()}-report.pdf`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('PDF saved with your frames, moments and results.');
  } catch(error) { toast(`PDF could not be created. ${error.message}`); }
  finally {
    await Promise.all(indices.map(async i=>{try{await seekDecoded(slots[i].video,originals[i]);}catch{/* Keep the decoded frame if this file becomes unavailable. */}}));
    Object.assign(commonTransport,savedCommon);job=null;reportDialog.close();update();
  }
};
$('privacy').onclick = () => $('privacyDialog').showModal(); $('closePrivacy').onclick = () => $('privacyDialog').close();
document.addEventListener('keydown', e => { if (job || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,select,textarea,button,a,[contenteditable]')) return; if (e.code === 'Space') { e.preventDefault(); togglePlay(true); } if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepBoth(e.key === 'ArrowLeft' ? -1 : 1); } });
window.addEventListener('resize', render);
slots.forEach((slot, index) => {
  slot.viewport = createViewport(slot, index, {
    busy: () => !!job, viewing: () => annotations?.isViewing() ?? true,
    enterView: () => annotations?.view(),
    changed: () => { annotations?.interrupt(); render(); },
  });
});
annotations = createAnnotations({ slots, state: () => ({ active, mode, busy: !!job }), selectSlot, pauseAll, pauseControlled, seekActive, toast, changed: updatePhases });
rangeSelector = createRangeSelector({ slots, state: () => ({ active, busy: !!job }), seek: seekRangeBoundary, pause: pauseControlled, changed: updateAnalysisControls });
studioScreen = createStudioScreen({ slots, state: () => ({ active, mode, linked, busy: !!job }), changed: () => { annotations?.interrupt(); slots.forEach(s => s.viewport?.cancelGesture()); render(); } });
moments = createMoments({slots, state:()=>({mode,busy:!!job}), controlClip, pause:pauseControlled, seek:seekActive, changed:updatePhases});
keyframeViews = createKeyframeViews({slots, state:()=>({mode,busy:!!job}), controlClip, seek:seekActive, play:togglePlay, changed:updatePhases, paintDrawings:annotations.paintFrame, focusVideo:()=>studioScreen.focus()});
createTaskHelp({screen: studioScreen, compare: () => setMode('compare')});
setMode('single'); requestAnimationFrame(playbackLoop);
