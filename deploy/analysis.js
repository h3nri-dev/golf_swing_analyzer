// Geometry uses image pixels, never raw normalized coordinates: portrait and
// landscape videos must produce the same angle for the same visible geometry.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const visible = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.65;
export function angle(a, b, c, width, height) {
  if (![a, b, c].every(visible)) return null;
  const u = [(a.x - b.x) * width, (a.y - b.y) * height];
  const v = [(c.x - b.x) * width, (c.y - b.y) * height];
  const norm = Math.hypot(...u) * Math.hypot(...v);
  return norm < 1e-8 ? null : Math.acos(clamp((u[0] * v[0] + u[1] * v[1]) / norm, -1, 1)) * 180 / Math.PI;
}
export function measurements(points, width, height, hand = 'right') {
  if (!points) return { elbow: null, knee: null, lean: null };
  const side = hand === 'right' ? 0 : 1;
  const elbow = angle(points[11 + side], points[13 + side], points[15 + side], width, height);
  const knee = angle(points[23 + side], points[25 + side], points[27 + side], width, height);
  let lean = null;
  if ([11, 12, 23, 24].every(i => visible(points[i]))) {
    const dx = ((points[11].x + points[12].x) - (points[23].x + points[24].x)) * width / 2;
    const dy = ((points[23].y + points[24].y) - (points[11].y + points[12].y)) * height / 2;
    if (Math.hypot(dx, dy) > 1e-8) lean = Math.atan2(Math.abs(dx), dy) * 180 / Math.PI;
  }
  return { elbow, knee, lean };
}
export function syncBounds(durationA, durationB, offset) {
  const start = Math.max(0, -offset);
  const end = Math.min(durationA, durationB - offset);
  return end > start ? { start, end } : null;
}
export function frameTime(time, direction, fps, start, end) {
  return clamp((Math.round(time * fps) + direction) / fps, start, end);
}
export function tempo(marks) {
  const { address, top, impact } = marks;
  if (![address, top, impact].every(Number.isFinite) || !(address < top && top < impact)) return null;
  return (top - address) / (impact - top);
}
export function nearestSample(samples, time, tolerance) {
  // Do not display a stale pose through missing detections or outside the scan.
  let lo = 0, hi = samples.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (samples[mid].time < time) lo = mid + 1; else hi = mid - 1; }
  const candidates = [samples[lo], samples[lo - 1]].filter(Boolean);
  const nearest = candidates.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
  return nearest && Math.abs(nearest.time - time) <= tolerance ? nearest : null;
}
export function smoothSamples(samples) {
  // A three-sample median rejects isolated jitter without filling occlusions.
  return samples.map((sample, i) => ({ ...sample, points: sample.points?.map((p, j) => {
    if (!visible(p)) return p;
    const neighbors = samples.slice(Math.max(0, i - 1), i + 2).map(s => s.points?.[j]).filter(visible);
    if (neighbors.length < 3) return p;
    const median = key => neighbors.map(n => n[key]).sort((a, b) => a - b)[1];
    return { ...p, x: median('x'), y: median('y') };
  }) ?? null }));
}
