// Drawings are stored in normalized, unmirrored video coordinates. The displayed
// image (not the letterboxed stage) is the coordinate system for every tool.
import { clamp } from './analysis.js';
export const clone = value => structuredClone(value);
export function isDrawingVisible(shape, time) {
  return shape.scope === 'clip' || Math.abs(time - shape.time) <= shape.frameDuration / 2 + 0.0001;
}
export function toVideoPoint(x, y, rect, mirrored = false) {
  const px = clamp((x - rect.left) / rect.width, 0, 1);
  return { x: mirrored ? 1 - px : px, y: clamp((y - rect.top) / rect.height, 0, 1) };
}
export function angleDegrees(points, width, height) {
  if (points.length !== 3) return null;
  const [a, b, c] = points;
  const u = { x: (a.x - b.x) * width, y: (a.y - b.y) * height };
  const v = { x: (c.x - b.x) * width, y: (c.y - b.y) * height };
  const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  return length < 1e-8 ? null : Math.acos(clamp((u.x * v.x + u.y * v.y) / length, -1, 1)) * 180 / Math.PI;
}
export function movePoints(points, dx, dy) {
  dx = clamp(dx, -Math.min(...points.map(p => p.x)), 1 - Math.max(...points.map(p => p.x)));
  dy = clamp(dy, -Math.min(...points.map(p => p.y)), 1 - Math.max(...points.map(p => p.y)));
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
}
const project = (p, width, height, mirrored) => ({ x: (mirrored ? 1 - p.x : p.x) * width, y: p.y * height });
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitShape(shape, point, width, height, tolerance = 12) {
  const p = project(point, width, height, false);
  const pts = shape.points.map(q => project(q, width, height, false));
  if (shape.tool === 'circle') {
    const [a, b] = pts, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    if (rx < 1 || ry < 1) return false;
    const norm = Math.hypot((p.x - (a.x+b.x)/2)/rx, (p.y - (a.y+b.y)/2)/ry);
    return Math.abs(norm - 1) * Math.min(rx, ry) <= tolerance;
  }
  return pts.some((q, i) => i > 0 && segmentDistance(p, pts[i - 1], q) <= tolerance);
}
export class DrawingHistory {
  constructor() { this.items = []; this.past = []; this.future = []; }
  commit(next) {
    this.past.push(clone(this.items));
    if (this.past.length > 50) this.past.shift();
    this.items = clone(next); this.future = [];
  }
  undo() { if (!this.past.length) return; this.future.push(this.items); this.items = this.past.pop(); }
  redo() { if (!this.future.length) return; this.past.push(this.items); this.items = this.future.pop(); }
  reset() { this.items = []; this.past = []; this.future = []; }
}
export function paintShape(ctx, shape, width, height, mirrored = false, selected = false) {
  if (!shape.points.length) return;
  const pts = shape.points.map(p => project(p, width, height, mirrored));
  ctx.save();
  ctx.lineWidth = shape.width; ctx.strokeStyle = shape.color; ctx.fillStyle = shape.color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#0008'; ctx.shadowBlur = 2;
  ctx.beginPath();
  if (shape.tool === 'circle' && pts.length > 1) {
    const [a, b] = pts;
    ctx.ellipse((a.x + b.x)/2, (a.y + b.y)/2, Math.abs(a.x-b.x)/2, Math.abs(a.y-b.y)/2, 0, 0, Math.PI*2);
  } else { pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); }
  ctx.stroke();
  if (shape.tool === 'arrow' && pts.length > 1) {
    const [a,b] = pts, direction = Math.atan2(b.y-a.y,b.x-a.x), size = 11 + shape.width;
    ctx.beginPath(); ctx.moveTo(b.x-size*Math.cos(direction-.45),b.y-size*Math.sin(direction-.45));
    ctx.lineTo(b.x,b.y); ctx.lineTo(b.x-size*Math.cos(direction+.45),b.y-size*Math.sin(direction+.45)); ctx.stroke();
  }
  if (shape.tool === 'angle' && pts.length === 3) {
    const value = angleDegrees(shape.points,width,height), [a,b,c] = pts;
    if (value !== null) {
      const start = Math.atan2(a.y-b.y,a.x-b.x), end = Math.atan2(c.y-b.y,c.x-b.x);
      const delta = Math.atan2(Math.sin(end-start),Math.cos(end-start));
      const radius = Math.min(30,Math.hypot(a.x-b.x,a.y-b.y)*.35,Math.hypot(c.x-b.x,c.y-b.y)*.35);
      ctx.beginPath(); ctx.arc(b.x,b.y,radius,start,start+delta,delta<0); ctx.stroke();
      const label = `${value.toFixed(1)}°`;
      ctx.font = '600 16px "DM Sans", sans-serif';
      const textWidth = ctx.measureText(label).width, padding = 7;
      const x = clamp(b.x + Math.cos(start+delta/2)*(radius+23)-textWidth/2,padding,width-textWidth-padding);
      const y = clamp(b.y + Math.sin(start+delta/2)*(radius+23),21,height-10);
      ctx.fillStyle = '#17251fe8'; ctx.fillRect(x-padding,y-18,textWidth+padding*2,26);
      ctx.fillStyle = shape.color; ctx.fillText(label,x,y+1);
    }
  }
  ctx.shadowBlur = 0;
  if (selected) {
    // Freehand paths move as one object; simple shapes expose their endpoints.
    const handles = shape.tool === 'pen' ? [pts[0]] : pts;
    for (const p of handles) { ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#24392e'; ctx.lineWidth=2; ctx.stroke(); }
  }
  ctx.restore();
}
