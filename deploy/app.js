import { clamp, visible, measurements, syncBounds, frameTime, tempo, nearestSample, smoothSamples } from './analysis.js';
import { createAnnotations } from './annotations.js';
import { createViewport } from './viewport.js';
import { createRangeSelector, analysisRangeError, MAX_ANALYSIS_SECONDS } from './range.js';
import { createStudioScreen } from './screen.js';
let annotations = null;
let rangeSelector = null;
let studioScreen = null;
const $ = id => document.getElementById(id);
const names = ['A', 'B'];
const phases = [['address', 'Address'], ['top', 'Top of backswing'], ['impact', 'Impact'], ['finish', 'Finish']];
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
let mode = 'single', active = 0, linked = true, offset = 0, aligned = false, job = null;
const slots = names.map((name, index) => {
  const card = document.createElement('section');
  card.className = `video-card${index === 0 ? ' selected' : ''}`;
  card.dataset.slot = index;
  card.setAttribute('aria-label', `Swing ${name}`);
  card.innerHTML = `<div class="video-top"><span class="slot-badge">${name}</span><span class="file-name">${index ? 'Reference swing' : 'Your swing'}</span><button class="replace" hidden>Replace</button><button class="remove" aria-label="Remove swing ${name}" hidden>×</button></div>
    <div class="stage"><video muted playsinline preload="auto" hidden></video><canvas class="pose-canvas" hidden></canvas><button class="dropzone" aria-label="Add swing ${name} video"><span class="upload-icon">↥</span><strong>${index ? 'Reference swing' : 'Your swing'}</strong><span class="drop-description">${index ? 'Your earlier swing, or a swing to learn from.' : 'Drop your swing video here, or browse your files.'}</span><span class="upload-cta">Choose video <span aria-hidden="true">↗</span></span><span class="file-types">MP4 · MOV · WEBM / BROWSER-SUPPORTED VIDEO</span></button><span class="corner-label" hidden>LOCAL VIDEO · <span class="clip-time">0.00 s</span></span></div>
    <input class="file-input" type="file" accept="video/*,.mov,.mp4,.webm" hidden aria-label="Swing ${name} video file">
    <div class="video-bottom"><button class="clip-play" disabled aria-label="Play swing ${name}">▶ Play ${name}</button><button class="sync-mark" disabled title="Use this moment as the synchronization point" hidden>Mark sync point</button><button class="mirror" disabled aria-pressed="false">Mirror</button><label class="fps-label">FPS <select class="fps" aria-label="Swing ${name} frame rate">${[24,25,30,50,60,120,240].map(n => `<option${n === 30 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="clip-transport" hidden aria-label="Independent swing ${name} controls"><div class="clip-timeline-row"><span>SWING ${name}</span><output class="clip-duration">0.00 / 0.00 s</output></div><input class="clip-timeline" type="range" min="0" max="1" step="0.001" value="0" aria-label="Swing ${name} timeline" disabled><div class="clip-frame-controls"><button class="clip-previous" aria-label="Previous frame swing ${name}" title="Previous frame" disabled>Ⅰ‹</button><button class="clip-next" aria-label="Next frame swing ${name}" title="Next frame" disabled>›Ⅰ</button><label>Speed <select class="clip-speed" aria-label="Swing ${name} playback speed" disabled>${[0.25,0.5,1,1.5].map(n => `<option value="${n}"${n === 1 ? ' selected' : ''}>${n}×</option>`).join('')}</select></label></div></div>`;
  $('videoGrid').append(card);
  // Controls keep their identity when the screen layout moves them into a panel.
  const controlCache = new Map();
  const get = selector => { const element = card.querySelector(selector); if (element) controlCache.set(selector, element); return element || controlCache.get(selector); };
  const slot = { card, video: get('video'), canvas: get('canvas'), stage: get('.stage'), input: get('.file-input'), drop: get('.dropzone'), get, ready: false, url: null, version: 0, playGeneration: 0, fps: 30, hand: 'right', samples: [], marks: {}, anchor: null, start: 0, end: 0, tolerance: 0.1, status: 'Add a video to get started.' };
  slot.drop.onclick = () => slot.input.click();
  get('.replace').onclick = () => slot.input.click();
  get('.remove').onclick = () => resetSlot(index);
  slot.input.onchange = () => { if (slot.input.files[0]) loadFile(index, slot.input.files[0]); };
  for (const type of ['dragenter', 'dragover']) slot.stage.addEventListener(type, e => { e.preventDefault(); slot.drop.classList.add('dragover'); });
  slot.stage.addEventListener('dragleave', () => slot.drop.classList.remove('dragover'));
  slot.stage.addEventListener('drop', e => { e.preventDefault(); slot.drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) loadFile(index, e.dataTransfer.files[0]); });
  get('.clip-play').onclick = () => { selectSlot(index); togglePlay(); };
  get('.clip-timeline').oninput = e => { const time = Number(e.target.value); selectSlot(index); seekActive(time); };
  get('.clip-previous').onclick = () => { selectSlot(index); step(-1); };
  get('.clip-next').onclick = () => { selectSlot(index); step(1); };
  get('.clip-speed').onchange = e => { const speed = Number(e.target.value); selectSlot(index); setSpeed(speed); };
  get('.sync-mark').onclick = () => { pauseControlled(index); slot.anchor = slot.video.currentTime; aligned = false; offset = 0; update(); toast(`Swing ${name} sync point marked at ${slot.anchor.toFixed(2)} s.`); };
  get('.mirror').onclick = () => { const on = slot.stage.classList.toggle('mirrored'); get('.mirror').setAttribute('aria-pressed', on); render(); };
  get('.fps').onchange = e => { slot.fps = Number(e.target.value); };
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
  $(`mark-${key}`).onclick = () => { pauseControlled(); slots[active].marks[key] = slots[active].video.currentTime; updatePhases(); };
  $(`phase-${key}`).onclick = () => seekActive(slots[active].marks[key]);
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
function isLinked() { return mode === 'compare' && linked && slots.every(s => s.ready); }
function pauseSlots(targets) { targets.forEach(s => { s.playGeneration++; s.video.pause(); }); }
function pauseAll() { pauseSlots(slots); }
function pauseControlled(index = active) { pauseSlots(isLinked() ? slots : [slots[index]]); }
function setSpeed(speed) {
  (isLinked() ? slots : [slots[active]]).forEach(s => s.video.playbackRate = speed);
  update();
}
function setLinked(next) {
  if (job || linked === next) return;
  if (next) pauseAll();
  // Unlink without interrupting playback; pending group play requests no longer own both clips.
  else slots.forEach(s => s.playGeneration++);
  linked = next;
  if (isLinked()) { setSpeed(slots[active].video.playbackRate); seekActive(slots[active].video.currentTime); }
  update();
}
function invalidateSync() { offset = 0; aligned = false; }
function resetSlot(index) {
  if (job) return;
  pauseControlled(index); const s = slots[index]; s.version++; s.ready = false; s.video.onerror = null;
  s.video.removeAttribute('src'); s.video.load();
  if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, { url: null, samples: [], analyzedRange: null, analysisAttempted: false, marks: {}, anchor: null, start: 0, end: 0, status: 'Add a video to get started.' });
  s.input.value = ''; s.get('.file-name').textContent = index ? 'Reference swing' : 'Your swing';
  s.video.hidden = true; s.drop.hidden = false; s.canvas.hidden = true;
  s.stage.classList.remove('mirrored'); s.get('.mirror').setAttribute('aria-pressed', false);
  s.viewport?.reset(); annotations?.reset(index); invalidateSync(); update();
}
async function loadFile(index, file) {
  if (job) return toast('Finish or cancel analysis before replacing a video.');
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name)) return toast('Choose a video file, such as MP4, MOV or WebM.');
  resetSlot(index); const s = slots[index], version = s.version;
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
    s.end = Math.min(MAX_ANALYSIS_SECONDS, s.video.duration);
    if (isLinked()) s.video.playbackRate = slots[1 - index].video.playbackRate;
    s.status = s.video.duration > MAX_ANALYSIS_SECONDS ? 'Choose up to 20 seconds in Range, then analyze.' : 'Ready. Choose a section in Range, or analyze the full clip.';
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
  $('singleMode').setAttribute('aria-pressed', mode === 'single'); $('compareMode').setAttribute('aria-pressed', mode === 'compare');
  $('comparisonBar').hidden = $('analysisTarget').hidden = mode !== 'compare';
  $('videoGrid').classList.toggle('compare', mode === 'compare');
  slots[1].card.hidden = mode !== 'compare';
  slots.forEach(s => s.get('.sync-mark').hidden = mode !== 'compare');
  if (isLinked()) { setSpeed(slots[active].video.playbackRate); seekActive(slots[active].video.currentTime); }
  $('modeCaption').textContent = mode === 'compare' ? 'Same moment. A new perspective.' : 'A little perspective goes a long way.';
  update();
}
function selectSlot(index) { if (job) return; if (active !== index) annotations?.interrupt(); active = index; update(); }
function updatePlayback() {
  if (!slots.length) return;
  const playing = isLinked() ? slots.some(s => !s.video.paused) : !slots[active].video.paused;
  $('play').textContent = playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  slots.forEach((s, i) => {
    const paused = isLinked() ? !playing : s.video.paused;
    s.get('.clip-play').textContent = `${paused ? '▶ Play' : 'Ⅱ Pause'} ${isLinked() ? 'both' : names[i]}`;
    s.get('.clip-play').dataset.shortLabel = `${paused ? '▶' : 'Ⅱ'} ${isLinked() ? 'Both' : names[i]}`;
    s.get('.clip-play').setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${isLinked() ? 'both swings' : `swing ${names[i]}`}`);
  });
}
function updateAnalysisControls() {
  const s = slots[active];
  const disabled = !s.ready || !!job || !!analysisRangeError(s.start, s.end, s.video.duration);
  $('analyze').disabled = $('analyzeSelection').disabled = disabled;
}
function update() {
  const s = slots[active], busy = !!job;
  for (const id of ['singleMode','compareMode','linked','independent','hand','speed']) $(id).disabled = busy;
  document.querySelectorAll('[data-select]').forEach(b => { b.disabled = busy; b.setAttribute('aria-pressed', Number(b.dataset.select) === active); });
  slots.forEach((slot, i) => {
    slot.card.classList.toggle('selected', i === active);
    for (const selector of ['.clip-play','.mirror','.sync-mark','.clip-timeline','.clip-previous','.clip-next','.clip-speed']) slot.get(selector).disabled = !slot.ready || busy;
    slot.get('.clip-transport').hidden = false;
    slot.get('.clip-speed').value = String(slot.video.playbackRate);
    slot.get('.replace').hidden = slot.get('.remove').hidden = !slot.ready;
    slot.get('.replace').disabled = slot.get('.remove').disabled = slot.get('.fps').disabled = busy;
    slot.drop.disabled = busy; slot.get('.corner-label').hidden = !slot.ready;
    slot.get('.sync-mark').textContent = slot.anchor === null ? 'Mark sync point' : `Sync: ${slot.anchor.toFixed(2)} s`;
  });
  for (const id of ['play','previous','next','restart','timeline','clearMarks']) $(id).disabled = !s.ready || busy;
  $('export').disabled = busy || (!s.samples.length && !Object.keys(s.marks).length && !annotations?.count(active));
  $('align').disabled = busy || !slots.every(x => x.ready && x.anchor !== null);
  $('cancel').hidden = !busy; $('progress').hidden = !busy;
  $('hand').value = s.hand;
  $('status').textContent = s.status; $('activeLabel').textContent = `SWING ${names[active]}`;
  $('speed').value = String(s.video.playbackRate);
  $('linked').setAttribute('aria-pressed', linked); $('independent').setAttribute('aria-pressed', !linked);
  $('syncHint').textContent = !linked ? 'Sync is off. Play either video or both at once. Each has its own timeline, frame steps and speed.' : aligned ? `Aligned to your marks · B offset ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} s · playback stops at the shared range end.` : 'Sync is on. Both clips play together. Mark the same moment in each clip to align, or choose Sync off for separate controls.';
  rangeSelector?.render(); updateAnalysisControls(); updatePhases(); updatePlayback(); render();
}
function updatePhases() {
  const s = slots[active];
  for (const [key] of phases) {
    const time = s.marks[key]; $(`phase-${key}`).textContent = time === undefined ? '—' : `${time.toFixed(2)} s`;
    $(`phase-${key}`).disabled = time === undefined || !!job; $(`mark-${key}`).disabled = !s.ready || !!job;
    $(`mark-${key}`).textContent = time === undefined ? '+ Mark' : 'Update';
  }
  const ratio = tempo(s.marks); $('tempo').textContent = ratio === null ? '—' : `${ratio.toFixed(2)} : 1`;
  $('tempoNote').textContent = ratio !== null ? `${(s.marks.top - s.marks.address).toFixed(2)} s backswing / ${(s.marks.impact - s.marks.top).toFixed(2)} s downswing. Based on your marks.` : ['address','top','impact'].every(k => k in s.marks) ? 'Marks must follow this order: address → top → impact.' : 'Mark address, top and impact to measure your tempo.';
  $('export').disabled = !!job || (!s.samples.length && !Object.keys(s.marks).length && !annotations?.count(active));
}
function seekActive(time) {
  if (!Number.isFinite(time) || job || !slots[active].ready) return;
  pauseControlled();
  if (isLinked()) {
    const bounds = syncBounds(slots[0].video.duration, slots[1].video.duration, offset);
    if (!bounds) return toast('These sync points have no shared playback range. Mark new points.');
    const target = clamp(time - (active === 1 ? offset : 0), bounds.start, bounds.end);
    slots[0].video.currentTime = target; slots[1].video.currentTime = target + offset;
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
    other.video.currentTime = clamp(s.video.currentTime + (active === 0 ? offset : -offset), 0, other.video.duration);
  }
  render();
}
async function togglePlay() {
  if (job || !slots[active].ready) return;
  const targets = isLinked() ? slots : [slots[active]];
  if (targets.some(s => !s.video.paused)) { pauseSlots(targets); return; }
  if (isLinked()) {
    const bounds = syncBounds(slots[0].video.duration, slots[1].video.duration, offset);
    if (!bounds) return toast('No shared playback range. Re-mark your sync points.');
    let time = slots[0].video.currentTime;
    if (time < bounds.start || time >= bounds.end - 0.02) time = bounds.start;
    slots[0].video.currentTime = time; slots[1].video.currentTime = time + offset;
  } else if (targets[0].video.ended || targets[0].video.currentTime >= targets[0].video.duration - 0.02) targets[0].video.currentTime = 0;
  const generations = targets.map(s => ++s.playGeneration);
  const results = await Promise.allSettled(targets.map(s => s.video.play()));
  if (results.some((r, i) => r.status === 'rejected' && generations[i] === targets[i].playGeneration)) {
    pauseSlots(targets.filter((s, i) => generations[i] === s.playGeneration));
    toast('Playback could not start. Try pressing Play again or use another video format.');
  }
  updatePlayback();
}
function step(direction) { const s = slots[active]; if (s.ready) seekActive(frameTime(s.video.currentTime, direction, s.fps, 0, s.video.duration)); }
function render() {
  const s = slots[active];
  studioScreen?.update();
  slots.forEach(slot => slot.viewport?.apply());
  $('timeline').max = s.ready ? s.video.duration : 1; $('timeline').value = s.video.currentTime || 0;
  $('time').textContent = `${(s.video.currentTime || 0).toFixed(2)} / ${(s.ready ? s.video.duration : 0).toFixed(2)} s`;
  slots.forEach(slot => {
    slot.get('.clip-timeline').max = slot.ready ? slot.video.duration : 1;
    slot.get('.clip-timeline').value = slot.video.currentTime || 0;
    slot.get('.clip-duration').textContent = `${(slot.video.currentTime || 0).toFixed(2)} / ${(slot.ready ? slot.video.duration : 0).toFixed(2)} s`;
  });
  slots.forEach((slot, i) => { if (slot.ready && (mode === 'compare' || i === 0)) draw(slot, i); });
  const sample = nearestSample(s.samples, s.video.currentTime, s.tolerance);
  const values = measurements(sample?.points, s.video.videoWidth, s.video.videoHeight, s.hand);
  for (const key of ['elbow','knee','lean']) $(key).innerHTML = `${values[key] === null ? '—' : Math.round(values[key])}<small>°</small>`;
  const count = s.samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
  $('coverage').innerHTML = `${s.samples.length ? Math.round(count / s.samples.length * 100) : '—'}<small>%</small>`;
  annotations?.render();
  rangeSelector?.renderPlayhead();
}
function draw(s, index) {
  s.get('.clip-time').textContent = `${s.video.currentTime.toFixed(2)} s`;
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
      if (frame.time > s.video.currentTime || frame.time < s.video.currentTime - 1.5) continue;
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
      const a = slots[0].video, b = slots[1].video, bounds = syncBounds(a.duration,b.duration,offset);
      if (!bounds || a.currentTime >= bounds.end - 0.015) pauseAll();
      else if (a.readyState < 3 || b.readyState < 3) { /* Wait for decoding before correcting drift. */ }
      else if (Math.abs(b.currentTime - a.currentTime - offset) > 0.065 && !b.seeking) b.currentTime = clamp(a.currentTime + offset,0,b.duration);
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
  const start = s.start, end = s.end, rangeError = analysisRangeError(start, end, s.video.duration);
  if (rangeError) return toast(rangeError);
  s.start = start; s.end = Math.min(end, s.video.duration); s.analysisAttempted = true;
  pauseAll(); const originalTime = s.video.currentTime; const token = { cancelled: false, controller: new AbortController() }; job = token;
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
      const result = detector.detectForVideo(buffer, i * interval * 1000 + 1);
      samples.push({ time, points: result.landmarks[0]?.map(p => ({ x: p.x, y: p.y, visibility: p.visibility })) ?? null });
      $('progress').value = (i + 1) / count; s.status = `Looking closer… ${Math.round((i + 1) / count * 100)}% · ${i + 1} / ${count} samples`; $('status').textContent = $('rangeStatus').textContent = s.status;
      await yieldFrame();
    }
    if (!token.cancelled) {
      s.samples = smoothSamples(samples); s.tolerance = interval * 0.6;
      s.analyzedRange = [start, s.end];
      const valid = samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
      s.status = valid === 0 ? 'No clear pose found. Try a well-lit clip with your whole body visible.' : `Analysis ready · ${samples.length} samples. ${valid / samples.length < 0.5 ? 'Low pose coverage: try better lighting or a clearer view.' : 'Scrub the video to explore your angles and hand path.'}`;
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
$('align').onclick = () => { pauseAll(); const next = slots[1].anchor - slots[0].anchor; if (!syncBounds(slots[0].video.duration,slots[1].video.duration,next)) return toast('Choose points with some video remaining after them.'); offset = next; aligned = true; linked = true; setSpeed(slots[active].video.playbackRate); slots.forEach(s => s.video.currentTime = s.anchor); update(); toast('Both swings are aligned to your marked moments.'); };
$('timeline').oninput = e => seekActive(Number(e.target.value)); $('play').onclick = togglePlay;
$('previous').onclick = () => step(-1); $('next').onclick = () => step(1); $('restart').onclick = () => seekActive(0);
$('speed').onchange = e => setSpeed(Number(e.target.value));
$('hand').onchange = e => { slots[active].hand = e.target.value; render(); };
for (const id of ['skeleton','trail','guideLines']) $(id).onchange = render;
$('clearMarks').onclick = () => { slots[active].marks = {}; updatePhases(); };
$('analyze').onclick = $('analyzeSelection').onclick = analyze; $('cancel').onclick = $('cancelSelection').onclick = () => { if (job) { job.cancelled = true; job.controller.abort(); $('status').textContent = $('rangeStatus').textContent = 'Cancelling… finishing the current model operation.'; } };
$('export').onclick = () => {
  const s = slots[active];
  const data = { version: 4, viewport: s.viewport.state(), drawings: annotations.data(active), drawingCoordinates: 'normalized, unmirrored video coordinates', file: s.get('.file-name').textContent, hand: s.hand, frameRate: s.fps, frameRateSource: 'user-selected', range: s.analyzedRange || [s.start,s.end], analyzedRange: s.analyzedRange ?? null, selectedRange: [s.start,s.end], marks: s.marks, tempo: tempo(s.marks), measurements: s.samples.map(sample => ({ time: sample.time, ...measurements(sample.points,s.video.videoWidth,s.video.videoHeight,s.hand) })), note: '2D image-plane estimates. Missing or low-confidence measurements are null. Frame rate is user-selected.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `swing-${names[active].toLowerCase()}-analysis.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('privacy').onclick = () => $('privacyDialog').showModal(); $('closePrivacy').onclick = () => $('privacyDialog').close();
document.addEventListener('keydown', e => { if (job || $('privacyDialog').open || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,select,textarea,button,a,[contenteditable]')) return; if (e.code === 'Space') { e.preventDefault(); togglePlay(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } });
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
setMode('single'); requestAnimationFrame(playbackLoop);
