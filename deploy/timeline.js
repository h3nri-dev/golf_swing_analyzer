import {clamp} from './analysis.js';

// Keep the review viewport in file seconds, like saved moments. Retiming only
// changes its displayed clock, and a following analysis selector cannot move it.
export function timelineBounds(slot, focused = false) {
  const duration = slot.ready && Number.isFinite(slot.video.duration) ? slot.video.duration : 0;
  const range = slot.analyzedRange;
  const start = range && Number.isFinite(range[0]) ? clamp(range[0],0,duration) : 0;
  const end = range && Number.isFinite(range[1]) ? clamp(range[1],0,duration) : 0;
  const available = end > start && end-start < duration-0.5/slot.fps;
  return {start:focused && available ? start : 0,end:focused && available ? end : duration,available,focused:focused && available};
}

// Spread nearby labels just enough to remain selectable. Leaders connect each
// label to its exact timestamp; extra lanes are needed only on narrow screens.
export function markerLayout(entries, bounds, width, size = 24) {
  if (bounds.end <= bounds.start || width < size) return [];
  const visible=entries.filter(e=>e.time>=bounds.start && e.time<=bounds.end).sort((a,b)=>a.time-b.time);
  const count=Math.max(1,Math.floor((width+4)/(size+4))),lanes=Math.ceil(visible.length/count);
  const layout=visible.map((entry,index)=>{
    const anchor=7+(entry.time-bounds.start)/(bounds.end-bounds.start)*(width-14);
    return {...entry,center:clamp(anchor,size/2,width-size/2),anchor,lane:index%lanes};
  });
  for(let lane=0;lane<lanes;lane++){
    const row=layout.filter(e=>e.lane===lane);
    for(let i=1;i<row.length;i++)row[i].center=Math.max(row[i].center,row[i-1].center+size+4);
    row.at(-1).center=Math.min(row.at(-1).center,width-size/2);
    for(let i=row.length-2;i>=0;i--)row[i].center=Math.min(row[i].center,row[i+1].center-size-4);
  }
  return layout;
}
