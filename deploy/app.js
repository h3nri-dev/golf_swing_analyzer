import { trackUsage } from './consent.js';
import { clamp, visible, measurements, tempo, nearestSample, smoothSamples } from './analysis.js';
import { mediaRate, synchronization, realTime, fileTime, frameStamp, seconds } from './timing.js';
import { detectFileFrameRate } from './file-fps.js';
import {readSourceFrames,stepSourceFrame,sourceFrameNumber,frameSeekTime} from './source-frames.js';
import { createMoments } from './moments.js';
import { PRIMARY_MOMENTS, suggestKeyMoments, keyMomentEntries, phaseTimes, firstSharedMoment } from './keyframes.js';
import { createKeyframeViews } from './keyframe-views.js';
import { createAnnotations } from './annotations.js';
import { defaultReview, drawReview, drawPose, cropRegion, mapCropPoints, postureNotes, frameAnalysis } from './review.js';
import { createReviewTools } from './review-tools.js';
import { createMomentNavigation } from './navigation.js';
import { linkedLoopBounds } from './timeline.js';
import { createViewport } from './viewport.js';
import { createRangeSelector, analysisRangeError } from './range.js';
import { createStudioScreen } from './screen.js';
import { createTaskHelp, confirmDiscard } from './ux.js';
let annotations = null, reviewTools = null, navigation = null;
let rangeSelector = null;
let studioScreen = null;
let moments = null, keyframeViews = null;
const $ = id => document.getElementById(id);
const names = ['A', 'B'];
const frameRates = [23.976,24,25,29.97,30,50,59.94,60,100,120,240];
const phases = PRIMARY_MOMENTS;
let mode = 'single', active = 0, linked = true, offset = 0, aligned = false, alignmentLabel = '', job = null;
// With sync off, the common controller owns its last group command. Local
// controls release its live updates without changing the displayed state.
const commonTransport = { following: false, clock: 0, time: 0, duration: 1, rate: 1, fps: 30, speed: '1', playing: false };
const slots = names.map((name, index) => {
  const card = document.createElement('section');
  card.className = `video-card${index === 0 ? ' selected' : ''}`;
  card.dataset.slot = index;
  card.setAttribute('aria-label', `Swing ${name}`);
  card.innerHTML = `<div class="video-top"><span class="slot-badge">${name}</span><span class="file-name">${index ? 'Reference swing' : 'Your swing'}</span><button class="replace" hidden>Replace</button><button class="remove" aria-label="Remove swing ${name}" hidden>×</button></div>
    <div class="stage"><video muted playsinline preload="auto" hidden></video><canvas class="pose-canvas" hidden></canvas><button class="dropzone" aria-label="Add swing ${name} video"><span class="upload-icon">↥</span><strong>${index ? 'Reference swing' : 'Your swing'}</strong><span class="drop-description">${index ? 'Your earlier swing, or a swing to learn from.' : 'Drop your swing video here, or browse your files.'}</span><span class="upload-cta">Choose video <span aria-hidden="true">↗</span></span><span class="file-types">MP4 · MOV · WEBM / BROWSER-SUPPORTED VIDEO</span></button><span class="corner-label video-brand" hidden><img src="favicon.svg?v=golf" width="20" height="20" alt=""><span>FreeGolf<wbr>Swing<wbr>Analyzer.com</span><span class="clip-time" aria-hidden="true">0.00 s</span></span></div>
    <input class="file-input" type="file" accept="video/*,.mov,.mp4,.webm" hidden aria-label="Swing ${name} video file">
    <div class="video-bottom"><button class="clip-play" disabled aria-label="Play swing ${name}">▶ Play ${name}</button><button class="mirror" disabled aria-pressed="false">Mirror</button><label class="fps-label">FPS <select class="fps" aria-label="Swing ${name} file frame rate">${frameRates.map(n => `<option${n === 30 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="clip-transport" hidden aria-label="Independent swing ${name} controls"><div class="clip-timeline-row"><span>SWING ${name}</span><output class="clip-duration">0:00 / 0:00</output><button class="clip-restart" aria-label="Restart swing ${name}" title="Restart this video" disabled>↺</button></div><input class="clip-timeline" type="range" min="0" max="1" step="0.001" value="0" aria-label="Swing ${name} timeline" disabled><div class="clip-frame-controls"><div class="clip-playback-buttons"><button class="clip-back-second time-jump" aria-label="Back 1 second swing ${name}" title="Back 1 real second" disabled>&lt; -1s</button><button class="clip-previous" aria-label="Previous frame swing ${name}" title="Previous frame" disabled>Ⅰ‹</button><button class="clip-next" aria-label="Next frame swing ${name}" title="Next frame" disabled>›Ⅰ</button><button class="clip-forward-second time-jump" aria-label="Forward 1 second swing ${name}" title="Forward 1 real second" disabled>&gt; +1s</button></div><label>Speed <select class="clip-speed" aria-label="Swing ${name} playback speed" disabled>${[0.1,0.25,0.5,1,1.5].map(n => `<option value="${n}"${n === 1 ? ' selected' : ''}>${n}×</option>`).join('')}</select></label></div></div>
    <div class="clip-timing" aria-label="Swing ${name} video timing"><label class="shot-fps-label" title="Camera recording rate. Leave Same for normal-speed files; choose the original recording FPS for a slow-motion export.">Shot FPS <select class="shot-fps" aria-label="Swing ${name} recording frame rate"><option value="same">Same</option>${frameRates.map(n => `<option value="${n}">${n}</option>`).join('')}</select></label></div>`;
  $('videoGrid').append(card);
  // Controls keep their identity when the screen layout moves them into a panel.
  const controlCache = new Map();
  const get = selector => { const element = card.querySelector(selector); if (element) controlCache.set(selector, element); return element || controlCache.get(selector); };
  const slot = { card, video: get('video'), canvas: get('canvas'), stage: get('.stage'), input: get('.file-input'), drop: get('.dropzone'), get, ready: false, url: null, version: 0, playGeneration: 0, fps: 30, shotFps: null, speed: 1, hand: 'right', samples: [], keyMoments: [], analysisVersion: 0, marks: {}, anchor: null, start: 0, end: 0, tolerance: 0.1, status: 'Add a video to get started.', review:defaultReview(), crop:'full', quality:'fast', loop:null };
  slot.drop.onclick = () => slot.input.click();
  get('.replace').onclick = () => slot.input.click();
  get('.remove').onclick = async () => { if (await confirmDiscard(slot, 'Remove', hasSavedWork(slot, index), mode)) resetSlot(index); };
  slot.input.onchange = () => { if (slot.input.files[0]) loadFile(index, slot.input.files[0]); };
  for (const type of ['dragenter', 'dragover']) slot.stage.addEventListener(type, e => { e.preventDefault(); slot.drop.classList.add('dragover'); });
  slot.stage.addEventListener('dragleave', () => slot.drop.classList.remove('dragover'));
  slot.stage.addEventListener('drop', e => { e.preventDefault(); slot.drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) loadFile(index, e.dataTransfer.files[0]); });
  get('.clip-play').onclick = () => controlClip(index, togglePlay);
  get('.clip-timeline').oninput = e => { const time = fileTime(Number(e.target.value),slot); controlClip(index, () => seekActive(time)); };
  get('.clip-previous').onclick = () => controlClip(index, () => step(-1));
  get('.clip-next').onclick = () => controlClip(index, () => step(1));
  get('.clip-back-second').onclick = () => controlClip(index, () => jumpSecond(-1));
  get('.clip-forward-second').onclick = () => controlClip(index, () => jumpSecond(1));
  get('.clip-restart').onclick = () => controlClip(index, () => seekActive(playbackRange(index)?.[0]??0));
  get('.clip-speed').onchange = e => { const speed = Number(e.target.value); controlClip(index, () => setSpeed(speed)); };
  get('.mirror').onclick = () => { const on = slot.stage.classList.toggle('mirrored'); get('.mirror').setAttribute('aria-pressed', on); render(); };
  const fpsStatus = document.createElement('span');
  fpsStatus.id = `file-fps-status-${index}`; fpsStatus.className = 'fps-status'; fpsStatus.hidden = true;
  fpsStatus.setAttribute('role', 'status'); get('.clip-timing').append(fpsStatus);
  get('.fps').setAttribute('aria-describedby', fpsStatus.id);
  get('.fps').onchange = e => {
    if (job || !slot.ready) return;
    slot.fpsSource = 'manual'; updateFpsStatus(slot);
    configureTiming(index, Number(e.target.value), slot.shotFps);
  };
  get('.shot-fps').onchange = e => configureTiming(index, slot.fps, e.target.value === 'same' ? null : Number(e.target.value));
  card.addEventListener('click', e => { if (!e.target.closest('button,input,select')) selectSlot(index); });
  slot.video.addEventListener('timeupdate', () => { if (!job) {loopPlayback();render();} });
  slot.video.addEventListener('seeked', () => { if (!job) {loopPlayback();render();} });
  slot.video.addEventListener('ended', () => { if (!loopPlayback(index) && isLinked()) pauseAll(); updatePlayback(); });
  slot.video.addEventListener('play', updatePlayback);
  slot.video.addEventListener('pause', updatePlayback);
  return slot;
});
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
function timingClips() { return slots.map(s => ({duration:s.video.duration, fps:s.fps, shotFps:s.shotFps ?? s.fps,sourceFps:s.sourceFps,sourceFrames:s.sourceFrames})); }
function timingRate(s) { return mediaRate(s.fps, s.shotFps ?? s.fps); }
function syncModel() { return synchronization(timingClips(), offset); }
function syncOffset() { return (slots[1].anchor ?? 0) / timingRate(slots[1]) - (slots[0].anchor ?? 0) / timingRate(slots[0]); }
function applySpeed(s) { s.video.playbackRate = s.speed * timingRate(s); }
function updateFpsStatus(s) {
  const status = s.get('.fps-status');
  const labels = { detecting: 'Detecting FPS…', auto: 'Auto-detected', variable: 'Variable FPS', average: 'Average FPS', manual: 'Manual FPS', fallback: 'Choose File FPS' };
  const descriptions = {
    detecting: 'Reading the frame rate locally from your video file.',
    auto: 'File FPS was detected automatically. You can change it if needed.',
    variable: 'Variable frame rate: File FPS shows the average for timing calibration. Frame buttons use the file’s actual timestamps when available.',
    average: 'File FPS was estimated from frame count and duration. Frame buttons use the file’s actual timestamps when available.',
    manual: 'Using your chosen File FPS. Shot FPS controls slow-motion timing separately.',
    fallback: 'Could not detect File FPS. Using 30 temporarily; choose the file’s frame rate here.',
  };
  status.hidden = !labels[s.fpsSource];
  status.textContent = labels[s.fpsSource] || '';
  status.title = descriptions[s.fpsSource] || '';
  status.dataset.source = s.fpsSource || '';
  s.get('.fps').title = status.title;
}
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
  // An independent common player freezes its transport, not its calibration.
  // Reinterpret its saved file frame using the updated FPS without adopting
  // the local playhead, speed or play state.
  if (isIndependent() && commonTransport.clock === index) {
    commonTransport.rate = timingRate(s);
    commonTransport.fps = s.fps;
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
  if(both)slots.forEach(s=>s.playbackScope='common');
  (isLinked() || (both && mode === 'compare') ? slots : [slots[active]]).forEach(s => { s.speed = speed; applySpeed(s); });
  update();
}
function setLinked(next) {
  if (job) return;
  if (next && mode === 'compare' && slots.every(s => s.ready)) {
    const marker = firstSharedMoment(slots);
    if (marker) return alignFrames(marker.times, marker.label);
  }
  if (linked === next) return;
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
  releaseCommon(); slots[index].playbackScope='local';selectSlot(index); action();
}
function invalidateSync() { offset = 0; aligned = false; alignmentLabel = ''; slots.forEach(s => s.anchor = null); }
function hasSavedWork(s, index) { return !!(s.samples.length || Object.values(s.regionResults||{}).some(r=>r.samples?.length) || Object.keys(s.marks).length || annotations?.count(index)); }
function cropChanged(index,crop) {
  if(job)return;const s=slots[index];pauseControlled(index);annotations?.interrupt();
  s.regionResults??={};
  const keys=['samples','keyMoments','analyzedRange','analysisAttempted','analysisQuality','tolerance','status'];
  s.regionResults[s.crop]=Object.fromEntries(keys.map(key=>[key,s[key]]));
  s.crop=crop;Object.assign(s,s.regionResults[crop]||{samples:[],keyMoments:[],analyzedRange:null,analysisAttempted:false,analysisQuality:null,tolerance:.1,status:'Video area changed. Analyze this area to detect its swing.'});
  s.analysisVersion++;s.viewport.reset();update();
}
function resetSlot(index) {
  if (job) return;
  pauseControlled(index); const s = slots[index]; s.version++; s.ready = false; s.video.onerror = null;
  s.fpsController?.abort(); s.fpsController = null; s.fpsSource = null;
  s.sourceFps=30;s.sourceFrames=null;s.sourceSeeks=null;
  for (const option of s.get('.fps').querySelectorAll('[data-detected]')) option.remove();
  updateFpsStatus(s);
  s.video.removeAttribute('src'); s.video.load();
  if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, { url: null, samples: [], keyMoments: [], analyzedRange: null, analysisAttempted: false, marks: {}, anchor: null, start: 0, end: 0, windowCenter: 0, windowSpan: 0, status: 'Add a video to get started.' });
  s.fps = 30; s.shotFps = null; s.speed = 1; s.review=defaultReview(); s.crop='full'; s.regionResults={}; s.quality='fast'; s.analysisQuality=null; s.loop=null;
  s.get('.fps').value = '30'; s.get('.shot-fps').value = 'same';
  for (const option of s.get('.shot-fps').options) option.disabled = option.value !== 'same' && Number(option.value) < 30;
  applySpeed(s);
  s.input.value = ''; s.get('.file-name').textContent = index ? 'Reference swing' : 'Your swing';
  s.video.hidden = true; s.drop.hidden = false; s.canvas.hidden = true;
  s.stage.classList.remove('mirrored'); s.get('.mirror').setAttribute('aria-pressed', false);
  s.viewport?.reset(); annotations?.reset(index); navigation?.reset(index); invalidateSync(); update();
}
async function loadFile(index, file) {
  if (job) return toast('Finish or cancel analysis before replacing a video.');
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name)) return toast('Choose a video file, such as MP4, MOV or WebM.');
  const s = slots[index];
  if (!await confirmDiscard(s, 'Replace', hasSavedWork(s, index), mode)) { s.input.value = ''; return; }
  if (job) return;
  resetSlot(index); const version = s.version;
  s.status = 'Opening video and detecting File FPS…'; s.get('.file-name').textContent = file.name;
  const controller = new AbortController(); s.fpsController = controller;
  s.fpsSource = 'detecting'; updateFpsStatus(s);
  const detection = detectFileFrameRate(file, { signal: controller.signal });
  const frameIndex = readSourceFrames(file, { signal: controller.signal });
  s.url = URL.createObjectURL(file);
  selectSlot(index);
  try {
    const decoded = new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); s.video.removeEventListener('loadeddata', loaded); s.video.removeEventListener('error', error); controller.signal.removeEventListener('abort', aborted); };
      const loaded = () => { cleanup(); resolve(); };
      const aborted = () => { cleanup(); resolve(); };
      const error = () => { cleanup(); reject(new Error('This video could not be decoded. Try an H.264 MP4 or WebM file.')); };
      const timer = setTimeout(error, 20000);
      s.video.addEventListener('loadeddata', loaded); s.video.addEventListener('error', error);
      controller.signal.addEventListener('abort', aborted, { once: true });
      s.video.src = s.url;
    });
    const [, detected,sourceIndex] = await Promise.all([decoded, detection,frameIndex]);
    if (s.version !== version) return;
    if (!Number.isFinite(s.video.duration) || s.video.duration <= 0 || !s.video.videoWidth) throw new Error('This video has no readable duration. Try exporting it as an MP4.');
    s.fpsController = null;
    s.sourceFps=detected?.fps||30;s.sourceFrames=sourceIndex?.times;s.sourceSeeks=sourceIndex?.seeks;
    if (detected) {
      s.fps = detected.fps;
      if (![...s.get('.fps').options].some(option => Number(option.value) === s.fps)) {
        const option = new Option(String(s.fps), String(s.fps)); option.dataset.detected = '';
        s.get('.fps').append(option);
      }
      s.get('.fps').value = String(s.fps);
      for (const option of s.get('.shot-fps').options) option.disabled = option.value !== 'same' && Number(option.value) < s.fps;
    }
    s.fpsSource = !detected ? 'fallback' : detected.variable ? 'variable' : detected.average ? 'average' : 'auto';
    updateFpsStatus(s);
    s.ready = true; s.video.hidden = false; s.drop.hidden = true; trackUsage('video_loaded',mode);
    if (isLinked()) { s.speed = slots[1 - index].speed; applySpeed(s); }
    if (isIndependent()) Object.assign(commonTransport, playerState(active), { following: false });
    s.status = 'Pause at your swing, then Analyze. Adjust the before/after seconds beside the timeline.';
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
  slots.forEach((s, i) => {
    const prefix = mode === 'compare' ? `Swing ${names[i]} ` : '';
    const suffix = mode === 'compare' ? ` swing ${names[i]}` : '';
    s.card.setAttribute('aria-label', mode === 'compare' ? `Swing ${names[i]}` : 'Your swing');
    for (const [selector, label] of [
      ['.remove', `Remove${suffix || ' video'}`], ['.dropzone', `Add${suffix} video`],
      ['.file-input', `${prefix}video file`], ['.fps', `${prefix}file frame rate`],
      ['.shot-fps', `${prefix}recording frame rate`], ['.clip-timing', `${prefix}video timing`],
      ['.clip-transport', `${prefix}playback controls`], ['.clip-timeline', `${prefix}timeline`],
      ['.clip-restart', `Restart${suffix}`], ['.clip-previous', `Previous frame${suffix}`],
      ['.clip-back-second', `Back 1 second${suffix}`], ['.clip-forward-second', `Forward 1 second${suffix}`],
      ['.clip-next', `Next frame${suffix}`], ['.clip-speed', `${prefix}playback speed`],
      ['.zoom-controls', `${prefix}zoom controls`], ['.zoom-slider', `${prefix}zoom`],
      ['.zoom-in', `Zoom in${suffix}`], ['.zoom-out', `Zoom out${suffix}`],
      ['.zoom-fit', `Fit${suffix || ' video'} to view`],
    ]) s.get(selector).setAttribute('aria-label', label[0].toUpperCase() + label.slice(1));
    s.get('.clip-timeline-row').querySelector('span').textContent = mode === 'compare' ? `SWING ${names[i]}` : 'VIDEO';
  });
  if (isLinked()) { setSpeed(slots[active].speed); seekActive(slots[active].video.currentTime); }
  $('modeCaption').textContent = mode === 'compare' ? 'Same moment. A new perspective.' : 'A little perspective goes a long way.';
  update();
}
function selectSlot(index) { if (job) return; if (active !== index) annotations?.interrupt(); active = index; update(); }
function updatePlayback() {
  if (!slots.length) return;
  const both = mode === 'compare';
  const playing = commonState().playing;
  const action = playing ? 'Pause' : 'Play', target = both ? 'both swings' : 'video';
  $('play').innerHTML = `<span aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span><span class="play-word">${action}${both ? ' both' : ''}</span>`;
  $('play').setAttribute('aria-label', `${action} ${target}`);
  slots.forEach((s, i) => {
    const paused = s.video.paused;
    s.get('.clip-play').textContent = `${paused ? '▶ Play' : 'Ⅱ Pause'}${both ? ` ${names[i]}` : ''}`;
    s.get('.clip-play').dataset.shortLabel = both ? `${paused ? '▶' : 'Ⅱ'} ${names[i]}` : paused ? '▶ Play' : 'Ⅱ Pause';
    s.get('.clip-play').setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${both ? `swing ${names[i]}` : 'video'}`);
  });
}
function analysisSelection(index, common = true) {
  const s=slots[index], saved=navigation?.playbackRange(index,common);
  const [start,end]=saved??rangeSelector?.windowAt(s.video.currentTime,s.video.duration,timingRate(s))??[s.start,s.end];
  return {start,end,reusing:!!saved};
}
function updateAnalysisControls() {
  const s = slots[active], selection=analysisSelection(active);
  const updateButton=(button,slot,range,label)=>{
    const {start,end,reusing}=range;
    button.disabled=!slot.ready||!!job||!!analysisRangeError(start,end,slot.video.duration,timingRate(slot),reusing);
    const times=slot.ready?`${seconds(realTime(start,slot))}–${seconds(realTime(end,slot))} s`:'no video';
    button.title=`${reusing?'Reanalyze':'Analyze'}${label} · ${times}.${reusing?' Keeps this range fixed; choose Full video to select a new range.':''} Replaces this video's markers when complete.`;
  };
  slots.forEach((slot,i)=>{const button=slot.get('.clip-analyze');if(button)updateButton(button,slot,analysisSelection(i,false),mode==='compare'?` swing ${names[i]}`:'');});
  const target = mode === 'compare' ? ` ${names[active]}` : '';
  $('analyze').textContent = `Analyze${target}`;
  updateButton($('analyze'),s,selection,target?` swing${target}`:'');
  navigation?.render();
  if (s.ready && !s.analysisAttempted) $('status').textContent = analysisRangeError(s.start,s.end,s.video.duration,timingRate(s)) || 'Move to your swing, then Analyze the green window.';
}
function update() {
  const s = slots[active], busy = !!job;
  for (const id of ['singleMode','compareMode','linked','independent','hand','speed']) $(id).disabled = busy;
  document.querySelectorAll('[data-select]').forEach(b => { b.disabled = busy; b.setAttribute('aria-pressed', Number(b.dataset.select) === active); });
  slots.forEach((slot, i) => {
    slot.card.classList.toggle('selected', i === active);
    for (const selector of ['.clip-play','.mirror','.clip-timeline','.clip-previous','.clip-next','.clip-back-second','.clip-forward-second','.clip-speed','.clip-restart']) slot.get(selector).disabled = !slot.ready || busy;
    slot.get('.clip-transport').hidden = mode !== 'compare';
    slot.get('.clip-speed').value = String(slot.speed);
    slot.get('.fps').disabled = slot.get('.shot-fps').disabled = !slot.ready || busy;
    slot.get('.replace').hidden = slot.get('.remove').hidden = !slot.ready;
    slot.get('.replace').disabled = slot.get('.remove').disabled = busy;
    slot.drop.disabled = busy; slot.get('.corner-label').hidden = !slot.ready;
  });
  const commonReady = mode === 'compare' ? slots.every(slot => slot.ready) : s.ready;
  for (const id of ['play','previous','next','backSecond','forwardSecond','restart','timeline','speed']) $(id).disabled = !commonReady || busy;
  $('export').disabled = busy || !s.ready;
  $('align').disabled = busy || !slots.every(x => x.ready);
  $('cancel').hidden = !busy; $('progress').hidden = !busy;
  $('hand').value = s.hand;
  $('status').textContent = s.status; $('activeLabel').textContent = mode === 'compare' ? 'BOTH' : 'VIDEO';
  for (const [id, label] of [['previous','Previous frame'],['next','Next frame'],['backSecond','Back 1 second'],['forwardSecond','Forward 1 second'],['restart','Restart'],['speed','Playback speed']]) $(id).setAttribute('aria-label', `${label}${mode === 'compare' ? ' both swings' : ''}`);
  $('restart').title = $('restart').getAttribute('aria-label');
  $('restart').innerHTML = '<span aria-hidden="true">↺</span><span class="restart-word"> Restart</span>';
  $('linked').setAttribute('aria-pressed', linked); $('independent').setAttribute('aria-pressed', !linked);
  const frameHint=slot=>slot.sourceFrames?.length?'One actual video frame, independent of FPS selections.':`Frame timestamps unavailable: approximate steps at the original ${slot.sourceFps||30} FPS estimate. FPS selections do not change steps.`;
  for(const slot of slots)for(const selector of ['.clip-previous','.clip-next'])slot.get(selector).title=frameHint(slot);
  for (const id of ['previous','next']) $(id).title = isLinked() ? `Move to the nearest frame boundary in either video while keeping sync. The slower video may hold its frame.${slots.every(s=>s.sourceFrames?.length)?'':' Stepping is approximate where frame timestamps are unavailable.'}` : frameHint(s);
  $('align').title = `Sync the displayed frames using each video's File FPS and Shot FPS. Use Sync off to position them first.`;
  rangeSelector?.render(); updateAnalysisControls(); updatePhases(); updatePlayback(); render();
}
function updatePhases() {
  const s = slots[active];
  $('syncHint').textContent = !linked ? 'Individual controls leave the common controller unchanged.' : aligned ? `Aligned${alignmentLabel ? ` at ${alignmentLabel}` : ''} · B offset ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} real s` : 'Sync is locked. Individual controls turn sync off.';
  const firstMarker = mode === 'compare' && slots.every(s => s.ready) ? firstSharedMoment(slots) : null;
  $('linked').title = firstMarker ? `Align both videos at ${firstMarker.label}, their first shared marker, and sync playback.` : 'Play and step both videos together. Existing sync points are kept when there is no shared marker.';
  const times=phaseTimes(s), ratio=tempo(times);
  const automatic=['address','top','impact'].some(key=>!Number.isFinite(s.marks[key]));
  $('tempo').textContent = ratio === null ? '—' : `${ratio.toFixed(2)} : 1`;
  $('tempoNote').textContent = ratio !== null ? `${seconds(realTime(times.top-times.address,s))} s backswing / ${seconds(realTime(times.impact-times.top,s))} s downswing. ${automatic?'From auto estimates; adjust moments below the player.':'Real time from your marks.'}` : ['address','top','impact'].every(k=>k in times) ? 'Moments must follow this order: address → top → impact.' : 'Analyze to find moments, or set address, top and impact below the player.';
  $('export').disabled = !!job || !s.ready;
  moments?.render();
  keyframeViews?.render(JSON.stringify(slots.map((s,i)=>annotations?.data(i))));
  navigation?.render();
}
function seekActive(time, reference = active) {
  if (!Number.isFinite(time) || job || !slots[active].ready) return;
  pauseControlled();
  if (isLinked()) {
    const model = syncModel();
    if (!model) return toast('These sync points have no shared playback range. Choose new sync frames.');
    const targets = model.mediaTimes(model.commonTime(time, reference));
    slots.forEach((slot, i) => slot.video.currentTime = Math.min(slot.video.duration,frameSeekTime(targets[i],slot)));
  } else slots[active].video.currentTime = clamp(frameSeekTime(time,slots[active]), 0, slots[active].video.duration);
  render();
}
async function togglePlay(both = false) {
  if (job || !slots[active].ready || (both && mode === 'compare' && !slots.every(s => s.ready))) return;
  const targets = isLinked() || (both && mode === 'compare') ? slots : [slots[active]];
  const shouldPause = both && isIndependent() ? commonState().playing : targets.some(s => !s.video.paused);
  if (both && isIndependent()) commonTransport.following = true;
  if (shouldPause) { pauseSlots(targets); updatePlayback(); render(); return; }
  targets.forEach(s=>s.playbackScope=both||isLinked()||mode==='single'?'common':'local');
  if (isLinked()) {
    const model = syncModel();
    if (!model) return toast('No shared playback range. Choose new sync frames.');
    const bounds=linkedLoopBounds(model,slots.map((s,i)=>playbackRange(i,true)));
    if(!bounds)return toast('The analyzed or loop ranges do not overlap. Align the swings with Sync Videos or choose Full video.');
    let time = model.commonTime(slots[0].video.currentTime, 0);
    if (time < bounds.start || time >= bounds.end - model.endTolerance) time = bounds.start;
    const targets = model.mediaTimes(time);
    slots.forEach((s, i) => s.video.currentTime = targets[i]);
  } else targets.forEach(s => {
    const [start,end]=playbackRange(slots.indexOf(s))??[0,s.video.duration];
    if(s.video.ended||s.video.currentTime<start||s.video.currentTime>=end-.5/s.fps)s.video.currentTime=start;
  });
  const generations = targets.map(s => ++s.playGeneration);
  const results = await Promise.allSettled(targets.map(s => s.video.play()));
  if (results.some((r, i) => r.status === 'rejected' && generations[i] === targets[i].playGeneration)) {
    pauseSlots(targets.filter((s, i) => generations[i] === s.playGeneration));
    toast('Playback could not start. Try pressing Play again or use another video format.');
  }
  updatePlayback();
}
function step(direction) { const s = slots[active]; if (s.ready) seekActive(stepSourceFrame(s.video.currentTime,direction,s)); }
// Shared commands remain available with sync off, preserving individual speeds
// and relative playheads until a clip reaches its own boundary.
function seekBoth(time) {
  if (mode !== 'compare' || isLinked()) return seekActive(time);
  if (job || !Number.isFinite(time) || !slots.every(s => s.ready)) return;
  const clock = slots[commonTransport.clock];
  const delta = (time - clock.video.currentTime) / timingRate(clock);
  slots.forEach(s=>s.playbackScope='common');
  commonTransport.following = true;
  pauseAll();
  slots.forEach(s => { s.video.currentTime = clamp(frameSeekTime(s.video.currentTime + delta * timingRate(s),s), 0, s.video.duration); });
  updatePlayback(); render();
}
function stepBoth(direction) {
  if (mode !== 'compare') return step(direction);
  if (job || !slots.every(s => s.ready)) return;
  slots.forEach(s=>s.playbackScope='common');
  if (isIndependent()) commonTransport.following = true;
  pauseAll();
  if (isLinked()) {
    const targets = syncModel()?.step(slots.map(s => s.video.currentTime), direction);
    if (targets) slots.forEach((s, i) => s.video.currentTime = Math.min(s.video.duration,frameSeekTime(targets[i],s)));
  } else slots.forEach(s => { s.video.currentTime = frameSeekTime(stepSourceFrame(s.video.currentTime,direction,s),s); });
  updatePlayback(); render();
}
// Time jumps keep playing videos playing and paused videos paused. Local
// buttons enter through controlClip, retaining independent controller scope.
function jumpSecond(direction, both = false) {
  if (job) return;
  const targets = both && mode === 'compare' ? slots : [slots[active]];
  if (!targets.every(s => s.ready)) return;
  if(both)targets.forEach(s=>s.playbackScope='common');
  if (both && isLinked()) {
    const model = syncModel();
    if (!model) return toast('No shared playback range. Choose new sync frames.');
    const times = model.mediaTimes(model.commonTime(slots[0].video.currentTime, 0) + direction);
    slots.forEach((s, i) => { s.video.currentTime = times[i]; });
  } else {
    if (both && isIndependent()) commonTransport.following = true;
    targets.forEach(s => { s.video.currentTime = clamp(s.video.currentTime + fileTime(direction, s), 0, s.video.duration); });
  }
  updatePlayback(); render();
}
function restartBoth() {
  if(job)return;
  if(mode!=='compare')return seekActive(playbackRange(active,true)?.[0]??0);
  if(!slots.every(s=>s.ready))return;
  slots.forEach(s=>s.playbackScope='common');
  if(isLinked()){
    const model=syncModel(),bounds=linkedLoopBounds(model,slots.map((s,i)=>playbackRange(i,true)));
    if(bounds)return seekActive(model.mediaTimes(bounds.start)[active]);
    return toast('The analyzed or loop ranges do not overlap. Align the swings with Sync Videos or choose Full video.');
  }
  commonTransport.following = true;
  pauseAll(); slots.forEach((s,i) => { s.video.currentTime = playbackRange(i,true)?.[0]??0; }); updatePlayback(); render();
}
function render() {
  const s = slots[active];
  studioScreen?.update();
  slots.forEach(slot => slot.viewport?.apply());
  const controller = commonState(), clockName = mode === 'compare' ? names[controller.clock] + ' ' : '';
  const elapsed = controller.time / controller.rate, duration = controller.duration / controller.rate;
  const frame = sourceFrameNumber(controller.time,slots[controller.clock]);
  $('timeline').setAttribute('aria-valuetext',`${seconds(elapsed)} real seconds, frame ${frame}`);
  $('timeline').setAttribute('aria-label', mode === 'compare' ? `Both videos timeline, swing ${names[controller.clock]} clock` : 'Video timeline');
  $('timeline').title = mode === 'compare' ? `Seek both by the same time change. Clock: swing ${names[controller.clock]}.` : 'Seek video';
  $('speed').value = controller.speed;
  $('time').dataset.shortTime = `${clockName}${seconds(elapsed)} s · F${frame}`;
  $('time').textContent = `${clockName}${seconds(elapsed)} / ${seconds(duration)} s`;
  $('time').title = `${seconds(elapsed)} real seconds · Frame ${frame} (first frame is 0)`;
  slots.forEach(slot => {
    slot.get('.clip-timeline').setAttribute('aria-valuetext',frameStamp(slot.video.currentTime || 0,slot));
    slot.get('.clip-duration').textContent = `${seconds(realTime(slot.video.currentTime,slot))} / ${seconds(realTime(slot.ready ? slot.video.duration : 0,slot))} s`;
    slot.get('.clip-duration').title = 'Elapsed / total real seconds, using File FPS and Shot FPS';
  });
  slots.forEach((slot, i) => { if (slot.ready && (mode === 'compare' || i === 0)) draw(slot, i); });
  reviewTools?.render();
  const count = s.samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
  $('coverage').innerHTML = `${s.samples.length ? Math.round(count / s.samples.length * 100) : '—'}<small>%</small>`;
  annotations?.render();
  rangeSelector?.renderPlayhead();
  navigation?.render();
  keyframeViews?.render(JSON.stringify(slots.map((s,i)=>annotations?.data(i))));
}
function draw(s, index) {
  s.get('.clip-time').textContent = frameStamp(s.video.currentTime,s);
  s.get('.clip-time').title = 'Elapsed real seconds and frame number (first frame is 0)';
  const {width:w,height:h}=s.viewport.geometry().image;
  const canvas=s.canvas;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  canvas.hidden=false;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
  drawReview(ctx,s,s.video.currentTime,w,h,{color:index?'#9ecdf2':'#d6ee9c',mirrorText:s.stage.classList.contains('mirrored')});
  const ghost=reviewTools?.ghost();
  if(index===0&&s.review.visible&&ghost?.enabled&&!job?.omitReference){
    const other=slots[1],points=nearestSample(other.samples,other.video.currentTime,other.tolerance)?.points;
    const a=cropRegion(s.crop),b=cropRegion(other.crop),flip=s.stage.classList.contains('mirrored')!==other.stage.classList.contains('mirrored');
    const mapped=points?.map(p=>({...p,x:a.x+(flip?1-(p.x-b.x)/b.width:(p.x-b.x)/b.width)*a.width}));
    ctx.save();ctx.globalAlpha=ghost.opacity;drawPose(ctx,mapped,w,h,{color:'#c3a0ff',size:s.review.size});ctx.restore();
  }
}
function playbackLoop() {
  if (!job) {
    loopPlayback();
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
function playbackRange(index,common=slots[index].playbackScope==='common') {
  return navigation?.playbackRange(index,common)??slots[index].loop;
}
function loopPlayback(endedIndex=null) {
  if(job)return false;
  const ranges=slots.map((s,i)=>playbackRange(i,isLinked()||s.playbackScope==='common'));
  if(isLinked()&&ranges.some(Boolean)){
    const model=syncModel();if(!model)return false;
    if(slots.every(s=>s.video.paused)&&endedIndex===null)return false;
    const bounds=linkedLoopBounds(model,ranges);
    if(!bounds){pauseAll();toast('The analyzed or loop ranges do not overlap. Align the swings with Sync Videos or choose Full video.');return false;}
    const {start,end}=bounds;
    const time=slots[0].video.currentTime/timingRate(slots[0]);
    // Either calibrated clip can reach its natural end first by a fraction
    // of a frame. An ended event must restart the pair's captured loop.
    if((!slots[0].video.paused||endedIndex!==null)&&(endedIndex!==null||time>=end-model.endTolerance||time<start)){
      const times=model.mediaTimes(start);slots.forEach((s,i)=>{s.video.currentTime=times[i];if(endedIndex!==null)s.video.play().catch(()=>{});});return true;
    }
  }else{
    let looped=false;
    slots.forEach((s,i)=>{const range=ranges[i];if(!range||!s.ready||(i===1&&mode!=='compare')||range[1]<=range[0])return;
      if((!s.video.paused||endedIndex===i)&&(s.video.currentTime>=range[1]-.5/s.fps||s.video.currentTime<range[0]||endedIndex===i)){
        s.video.currentTime=range[0];if(endedIndex===i)s.video.play().catch(()=>{});looped=true;
      }
    });return looped;
  }
  return false;
}
const yieldFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
async function seekDecoded(video, time) {
  time=Math.min(video.duration,frameSeekTime(time,slots.find(s=>s.video===video)));
  if (Math.abs(video.currentTime - time) < 0.0000005 && video.readyState >= 2 && !video.seeking) return;
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
async function analyze(common = true) {
  const s = slots[active]; if (!s.ready || job) return;
  // Freeze the playhead before selecting the automatic window so the restored
  // frame and analyzed interval have the same anchor, even during playback.
  pauseAll();
  // Use this controller's saved review bounds until it returns to Full video.
  // Local and common views may differ, so the clicked Analyze button owns scope.
  rangeSelector.prepare();
  const {start,end,reusing}=analysisSelection(active,common);
  const rangeError = analysisRangeError(start, end, s.video.duration, timingRate(s),reusing);
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
      baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${s.quality==='detailed'?'heavy':'lite'}/float16/1/pose_landmarker_${s.quality==='detailed'?'heavy':'lite'}.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
    }), token, lateDetector => lateDetector.close());
    if (token.cancelled) return;
    const duration = s.end - start, count = Math.min(s.quality==='detailed'?2400:240, Math.max(2, Math.ceil(duration * (s.quality==='detailed'?s.fps:Math.min(s.fps, 30))-1e-7)));
    const interval = duration / count, samples = [];
    const buffer = document.createElement('canvas'), region=cropRegion(s.crop); const scale = Math.min(1, (s.quality==='detailed'?960:640) / Math.max(s.video.videoWidth*region.width,s.video.videoHeight));
    buffer.width = Math.round(s.video.videoWidth*region.width * scale); buffer.height = Math.round(s.video.videoHeight * scale); const ctx = buffer.getContext('2d');
    for (let i = 0; i < count; i++) {
      if (token.cancelled) break;
      const time = start + i * interval;
      await seekDecoded(s.video, time);
      if (token.cancelled) break;
      ctx.drawImage(s.video,region.x*s.video.videoWidth,0,region.width*s.video.videoWidth,s.video.videoHeight,0,0,buffer.width,buffer.height);
      const result = detector.detectForVideo(buffer, realTime(i * interval,s) * 1000 + 1);
      samples.push({ time, points: mapCropPoints(result.landmarks[0]?.map(p => ({ x: p.x, y: p.y, visibility: p.visibility })),s.crop) });
      $('progress').value = (i + 1) / count; s.status = `Looking closer… ${Math.round((i + 1) / count * 100)}% · ${i + 1} / ${count} samples`; $('status').textContent = s.status;
      await yieldFrame();
    }
    if (!token.cancelled) {
      // Prepare the new results before replacing any saved review state.
      // Completed analysis owns this clip's markers; cancellation or failure
      // must leave its previous manual edits and detected moments intact.
      const smoothed = smoothSamples(samples);
      const keyMoments = suggestKeyMoments(smoothed,start,s.end,s.fps,{anchor:originalTime,rate:timingRate(s),aspect:s.video.videoWidth/s.video.videoHeight});
      Object.assign(s,{samples:smoothed,tolerance:interval*.6,analyzedRange:[start,s.end],analysisQuality:s.quality,keyMoments,marks:{},loop:null});
      s.analysisVersion++;
      navigation.focusAnalysis(active);
      // Analyze is an explicit review command. Subsequent individual playback
      // still leaves the common controller and its chosen clock untouched.
      if(isIndependent())Object.assign(commonTransport,playerState(active),{time:originalTime,following:false});
      trackUsage('analysis_complete',mode);
      const valid = samples.filter(x => x.points && [11,12,23,24].every(i => visible(x.points[i]))).length;
      const detected=s.keyMoments.some(e=>e.source==='estimated');
      s.status = detected ? 'Analysis ready · 7 key moments estimated automatically. Click a frame to review; use its Set button to correct it.'
        : valid === 0 ? 'No clear pose found. Try a well-lit clip with your whole body visible.'
        : 'Analysis ready · Swing phases unclear. Range previews are available; set moments below the player.';
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
function alignFrames(times=slots.map(s=>s.video.currentTime), label='') {
  if (job || !slots.every(s => s.ready)) return;
  pauseAll();
  const next = times[1] / timingRate(slots[1]) - times[0] / timingRate(slots[0]);
  if (!synchronization(timingClips(), next)) return toast('Choose frames with video remaining in both clips.');
  slots.forEach((s,i) => { s.anchor = times[i]; });
  offset = next; aligned = true; alignmentLabel = label; linked = true;
  setSpeed(slots[active].speed);
  slots.forEach(s => { s.video.currentTime = frameSeekTime(s.anchor,s); });
  update(); toast(label ? `Aligned at ${label}, the first shared marker. Play both to compare.` : 'Aligned to these frames. Play both to compare.');
}
$('align').onclick=()=>alignFrames();
$('timeline').oninput = e => seekBoth(Number(e.target.value) * commonState().rate); $('play').onclick = () => togglePlay(true);
$('backSecond').onclick = () => jumpSecond(-1, true); $('forwardSecond').onclick = () => jumpSecond(1, true);
$('previous').onclick = () => stepBoth(-1); $('next').onclick = () => stepBoth(1); $('restart').onclick = restartBoth;
$('speed').onchange = e => setSpeed(Number(e.target.value), true);
$('hand').onchange = e => { slots[active].hand = e.target.value; render(); };

$('analyze').onclick = () => analyze(true); $('cancel').onclick = () => { if (job) { job.cancelled = true; job.controller.abort(); $('status').textContent = 'Cancelling… finishing the current model operation.'; } };
// Shared report model: timestamps remain in media seconds internally so
// drawings and analyzed samples stay attached to their original frames.
export function reportData(index = active) {
  const s = slots[index];
  const values = time => measurements(nearestSample(s.samples,time,s.tolerance)?.points,s.video.videoWidth,s.video.videoHeight,s.hand);
  const valid = s.samples.filter(sample=>sample.points && [11,12,23,24].every(i=>visible(sample.points[i]))).length;
  return { name:names[index], file:s.get('.file-name').textContent, hand:s.hand, crop:s.crop, quality:s.analysisQuality||s.quality, review:{...s.review}, observations:postureNotes(s,s.video.currentTime),
    frameRate:s.fps, sourceFrameRate:s.sourceFps, exactFrameTimes:!!s.sourceFrames?.length, currentFrame:sourceFrameNumber(s.video.currentTime,s), recordingFrameRate:s.shotFps ?? s.fps, mediaSecondsPerRealSecond:timingRate(s),
    viewport:s.viewport.state(), mirrored:s.stage.classList.contains('mirrored'), drawings:annotations.data(index),
    currentTime:s.video.currentTime, duration:s.video.duration, currentMeasurements:values(s.video.currentTime), currentAnalysis:frameAnalysis(s,s.video.currentTime),
    range:s.analyzedRange || [s.start,s.end], selectedRange:[s.start,s.end], analyzedRange:s.analyzedRange ?? null,
    marks:{...s.marks}, keyMoments:keyMomentEntries(s).map(entry=>({...entry,frame:Number.isFinite(entry.time)?sourceFrameNumber(entry.time,s):null,analysis:frameAnalysis(s,entry.time,entry)})), phaseTimes:phaseTimes(s), tempo:tempo(phaseTimes(s)), coverage:s.samples.length ? Math.round(valid/s.samples.length*100) : 0,
    momentMeasurements:Object.fromEntries(phases.map(([key])=>[key,values(phaseTimes(s)[key])])),
    measurements:s.samples.map(sample=>({time:sample.time,realSeconds:realTime(sample.time,s),frame:sourceFrameNumber(sample.time,s),...values(sample.time)})),
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
    // Capture both current views before seeking either player to its moments;
    // reference overlays must use the session's original paired positions.
    await Promise.all(indices.map(index=>seekDecoded(slots[index].video,originals[index])));
    render();
    for(const [column,index] of indices.entries()) {
      if(token.cancelled)return;
      report.clips[column].currentImage=annotations.capture(index).toDataURL('image/jpeg',.94);
    }
    token.omitReference=true;
    for(const [column,index] of indices.entries()) {
      const s=slots[index],clip=report.clips[column];
      // A reference at the other player's current time is meaningful only in
      // the current-view snapshot. Phase pages show each clip's own pose.
      clip.visualMoments=clip.keyMoments.filter(entry=>Number.isFinite(entry.time));
      for(const entry of clip.visualMoments) {
        if(token.cancelled)return;
        reportDialog.querySelector('p').textContent=`Preparing ${mode === 'compare' ? `swing ${names[index]}` : 'your swing'}: ${entry.label.toLowerCase()}…`;
        await seekDecoded(s.video,entry.time);render();
        entry.image=annotations.capture(index).toDataURL('image/jpeg',.94);
        entry.measurements=entry.analysis.measurements;
        entry.observations=entry.analysis.observations;
      }
    }
    if(token.cancelled)return;
    reportDialog.querySelector('p').textContent='Laying out your report…';
    const blob=await createPdfReport(report);
    if(token.cancelled)return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download=indices.length===2?'swing-comparison-report.pdf':'swing-report.pdf';
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
studioScreen = createStudioScreen({ slots, state: () => ({ active, mode, linked, busy: !!job }), analyzeSlot:index=>{selectSlot(index);analyze(false);}, changed: () => { slots.forEach(s => s.viewport?.cancelGesture()); render(); } });
rangeSelector = createRangeSelector({ slots, state: () => ({ active, mode, busy: !!job, reviewFocused:!!navigation?.playbackRange(active,true) }), changed: updateAnalysisControls, notice:toast });
moments = createMoments({slots, state:()=>({mode,busy:!!job}), controlClip, pause:pauseControlled, seek:seekActive, changed:updatePhases});
keyframeViews = createKeyframeViews({slots, state:()=>({mode,busy:!!job}), controlClip, seek:seekActive, play:togglePlay, changed:updatePhases, paintDrawings:annotations.paintFrame, focusVideo:()=>studioScreen.focus(),markMoment:(i,key)=>moments.set(i,key),editMoments:i=>moments.open(i),alignMoment:key=>{const times=slots.map(s=>phaseTimes(s)[key]);if(times.every(Number.isFinite))alignFrames(times);}});
reviewTools=createReviewTools({slots,state:()=>({active,mode,busy:!!job}),changed:()=>{render();updatePhases();},cropChanged});
navigation=createMomentNavigation({slots,state:()=>({active,mode,busy:!!job,controller:commonState()}),jump:(i,time)=>controlClip(i,()=>seekActive(time)),jumpCommon:seekBoth,stepLocal:(i,direction)=>controlClip(i,()=>step(direction)),stepCommon:stepBoth,changed:render,select:selectSlot,
  windowAt:rangeSelector.windowAt,windowDescription:rangeSelector.description,
  scopeChanged:index=>{
    const targets=index===null?(mode==='compare'?slots:[slots[active]]):[slots[index]];
    if(index!==null)releaseCommon();
    targets.forEach(s=>{s.playbackScope=index===null?'common':'local';s.loop=null;});
    loopPlayback();
    updateAnalysisControls();
  },loop:()=>{
  if(job||!slots[active].ready)return;const s=slots[active];rangeSelector.prepare();s.loop=s.loop?null:[s.start,s.end];update();
}});
createTaskHelp({screen: studioScreen, compare: () => setMode('compare')});
setMode('single'); requestAnimationFrame(playbackLoop);
