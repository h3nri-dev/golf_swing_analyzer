import { clamp } from './analysis.js';
import { cropRegion } from './review.js';

export function fitVideo(videoWidth, videoHeight, stageWidth, stageHeight) {
  const scale = Math.min(stageWidth / videoWidth, stageHeight / videoHeight);
  return { width: Math.max(1, Math.round(videoWidth * scale)), height: Math.max(1, Math.round(videoHeight * scale)) };
}
// Centers are normalized display coordinates, so the inspected area survives a
// responsive resize. Limit panning to avoid exposing extra empty space.
export function constrainView(view, image, stage) {
  const zoom = clamp(view.zoom, 1, 4);
  const x = Math.min(0.5, stage.width / (2 * image.width * zoom));
  const y = Math.min(0.5, stage.height / (2 * image.height * zoom));
  return { zoom, x: clamp(view.x, x, 1 - x), y: clamp(view.y, y, 1 - y) };
}
export function zoomAt(view, zoom, anchor, image, stage) {
  zoom = clamp(zoom, 1, 4);
  return constrainView({
    zoom,
    x: view.x + (anchor.x - stage.width / 2) / image.width * (1 / view.zoom - 1 / zoom),
    y: view.y + (anchor.y - stage.height / 2) / image.height * (1 / view.zoom - 1 / zoom),
  }, image, stage);
}
export function viewOffset(view, image) {
  return { x: (0.5 - view.x) * image.width * view.zoom, y: (0.5 - view.y) * image.height * view.zoom };
}

export function createViewport(slot, index, { busy, viewing, enterView, changed }) {
  const name = index ? 'B' : 'A';
  const plane = document.createElement('div'); plane.className = 'video-plane';
  slot.stage.insertBefore(plane, slot.video); plane.append(slot.video, slot.canvas); slot.plane = plane;
  const controls = document.createElement('div'); controls.className = 'zoom-controls';
  controls.setAttribute('aria-label', `Swing ${name} zoom controls`);
  controls.innerHTML = `<span class="zoom-label">Zoom</span><button class="zoom-out" aria-label="Zoom out swing ${name}" title="Zoom out">−</button><input class="zoom-slider" type="range" min="1" max="4" step="0.05" value="1" aria-label="Swing ${name} zoom"><button class="zoom-in" aria-label="Zoom in swing ${name}" title="Zoom in">+</button><output class="zoom-value">1.00×</output><button class="zoom-pan" aria-pressed="false" title="Drag the video to move the zoomed view">Pan</button><button class="zoom-fit" title="Reset zoom and center the video">Fit</button><span class="zoom-help">Zoom stays while playing.</span>`;
  slot.get('.clip-transport').insertAdjacentElement('afterend', controls);
  const controlCache = new Map();
  const get = selector => { const element = controls.querySelector(selector); if (element) controlCache.set(selector, element); return element || controlCache.get(selector); };
  let view = { zoom: 1, x: 0.5, y: 0.5 }, panEnabled = true, gesture = null;
  const pointers = new Map();
  const stageSize = () => ({ width: slot.stage.clientWidth, height: slot.stage.clientHeight });
  const region = () => {const r=cropRegion(slot.crop);return slot.stage.classList.contains('mirrored')?{...r,x:1-r.x-r.width}:r;};
  const imageSize = () => {
    const crop=cropRegion(slot.crop),size=fitVideo((slot.video.videoWidth||1)*crop.width,slot.video.videoHeight||1,slot.stage.clientWidth||1,slot.stage.clientHeight||1);
    return {width:Math.round(size.width/crop.width),height:size.height};
  };
  const croppedSize = () => {const image=imageSize();return {...image,width:image.width*region().width};};
  const canPan = () => slot.ready && !busy() && panEnabled && viewing() && view.zoom > 1;
  function apply() {
    const disabled = !slot.ready || busy();
    plane.hidden = !slot.ready;
    if (slot.ready && slot.stage.clientWidth && slot.stage.clientHeight) {
      const image = imageSize(), stage = stageSize();
      const crop=region();view = constrainView(view, croppedSize(), stage);
      const offset = viewOffset(view, croppedSize());
      plane.style.width = `${image.width}px`; plane.style.height = `${image.height}px`;
      plane.style.left = `${(stage.width-image.width*crop.width)/2-crop.x*image.width}px`; plane.style.top = `${(stage.height - image.height) / 2}px`;
      plane.style.clipPath=`inset(0 ${(1-crop.x-crop.width)*100}% 0 ${crop.x*100}%)`;
      plane.style.transformOrigin=`${(crop.x+crop.width/2)*100}% 50%`;
      plane.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${view.zoom})`;
    }
    get('.zoom-slider').value = view.zoom;
    get('.zoom-slider').setAttribute('aria-valuetext', `${view.zoom.toFixed(2)} times`);
    const label = `${view.zoom.toFixed(2)}×`;
    if (get('.zoom-value').textContent !== label) get('.zoom-value').textContent = label;
    get('.zoom-out').disabled = disabled || view.zoom <= 1;
    get('.zoom-in').disabled = disabled || view.zoom >= 4;
    get('.zoom-slider').disabled = disabled;
    get('.zoom-fit').disabled = disabled || view.zoom === 1;
    get('.zoom-pan').disabled = disabled || view.zoom === 1;
    get('.zoom-pan').setAttribute('aria-pressed', canPan());
    slot.stage.classList.toggle('zoom-panning', canPan());
    if (!canPan()) endGesture();
    const hint = view.zoom === 1 ? 'Zoom stays while playing.' : canPan() ? 'Drag to pan · pinch or Ctrl + scroll to zoom.' : 'Choose Pan to move the view. Drawings stay aligned.';
    if (get('.zoom-help').textContent !== hint) get('.zoom-help').textContent = hint;
  }
  function setZoom(zoom, anchor) {
    if (!slot.ready || busy()) return;
    const stage = stageSize();
    view = zoomAt(view, zoom, anchor || { x: stage.width / 2, y: stage.height / 2 }, croppedSize(), stage);
    panEnabled = true; changed(); apply();
  }
  get('.zoom-in').onclick = () => setZoom(view.zoom + 0.25);
  get('.zoom-out').onclick = () => setZoom(view.zoom - 0.25);
  get('.zoom-slider').oninput = e => setZoom(Number(e.target.value));
  get('.zoom-fit').onclick = () => { endGesture(); view = { zoom: 1, x: 0.5, y: 0.5 }; changed(); apply(); };
  get('.zoom-pan').onclick = () => { const wasPanning = canPan(); enterView(); panEnabled = !wasPanning; changed(); apply(); };
  slot.stage.addEventListener('wheel', e => {
    // Preserve ordinary page scrolling. Ctrl+wheel also covers trackpad pinch.
    if (!slot.ready || busy() || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); endGesture();
    const rect = slot.stage.getBoundingClientRect();
    const delta = clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1), -300, 300);
    setZoom(view.zoom * Math.exp(-delta * 0.004), { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, { passive: false });
  const local = e => {
    const rect = slot.stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  function beginGesture() {
    const points = [...pointers.values()];
    if (!points.length) { gesture = null; slot.stage.classList.remove('zoom-dragging'); return; }
    const midpoint = points.length === 1 ? points[0] : { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    gesture = { view: { ...view }, midpoint, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0 };
  }
  function endGesture() {
    const ids = [...pointers.keys()]; pointers.clear(); gesture = null;
    ids.forEach(id => { if (slot.stage.hasPointerCapture(id)) slot.stage.releasePointerCapture(id); });
    slot.stage.classList.remove('zoom-dragging');
  }
  slot.stage.addEventListener('pointerdown', e => {
    if (!canPan() || e.button !== 0 || pointers.size >= 2) return;
    e.preventDefault(); e.stopPropagation();
    pointers.set(e.pointerId, local(e)); slot.stage.setPointerCapture(e.pointerId);
    beginGesture(); slot.stage.classList.add('zoom-dragging');
  }, true);
  slot.stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    e.preventDefault(); e.stopPropagation(); pointers.set(e.pointerId, local(e));
    const points = [...pointers.values()], image = croppedSize(), stage = stageSize();
    const midpoint = points.length === 1 ? points[0] : { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    const zoom = gesture.distance > 0 ? clamp(gesture.view.zoom * distance / gesture.distance, 1, 4) : gesture.view.zoom;
    const anchored = zoomAt(gesture.view, zoom, gesture.midpoint, image, stage);
    view = constrainView({ zoom, x: anchored.x - (midpoint.x - gesture.midpoint.x) / (image.width * zoom), y: anchored.y - (midpoint.y - gesture.midpoint.y) / (image.height * zoom) }, image, stage);
    changed(); apply();
  }, true);
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    e.stopPropagation(); pointers.delete(e.pointerId);
    if (slot.stage.hasPointerCapture(e.pointerId)) slot.stage.releasePointerCapture(e.pointerId);
    beginGesture();
  }
  slot.stage.addEventListener('pointerup', pointerEnd, true);
  slot.stage.addEventListener('pointercancel', () => endGesture(), true);
  slot.stage.addEventListener('lostpointercapture', pointerEnd);
  return {
    apply,
    reset() { endGesture(); view = { zoom: 1, x: 0.5, y: 0.5 }; panEnabled = true; apply(); },
    cancelGesture: endGesture,
    state: () => ({ ...view }),
    geometry: () => {
      const image=imageSize(),crop=region(),offset=viewOffset(view,croppedSize());
      offset.x+=(.5-crop.x-crop.width/2)*image.width*view.zoom;
      return {image,stage:stageSize(),...view,offset,crop};
    },
  };
}
