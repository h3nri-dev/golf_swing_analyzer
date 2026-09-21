import { visible } from './analysis.js';
import { frameNumber, lastFrame } from './timing.js';

export const KEY_MOMENTS = [['address','Address'],['top','Top of backswing'],['downswing','Downswing'],['impact','Impact'],['follow','Follow-through'],['finish','Finish']];
export const PRIMARY_MOMENTS = KEY_MOMENTS.filter(([key])=>!['downswing','follow'].includes(key));

// These are editable pose-based suggestions, not ball-contact detection. Work
// relative to the torso, so image aspect, mirroring and camera distance do not
// change the vertical hand trajectory. Never bridge a long pose occlusion.
export function suggestKeyMoments(samples, start, end, fps) {
  const snap = time => Math.max(start, Math.min(lastFrame(end,fps)/fps, frameNumber(time,fps)/fps));
  const fallback = () => KEY_MOMENTS.map(([key],i)=>({key,time:snap(start+(end-start)*i/5),source:'sampled',label:`Range frame ${i+1}`}));
  const tracked = samples.map(sample=>{
    const p=sample.points;
    if(!p || ![11,12,15,16,23,24].every(i=>visible(p[i])))return null;
    const hip=(p[23].y+p[24].y)/2, shoulder=(p[11].y+p[12].y)/2, torso=hip-shoulder;
    return torso>.05 ? {time:sample.time,y:((p[15].y+p[16].y)/2-hip)/torso} : null;
  });
  if(samples.length<12 || tracked.filter(Boolean).length<samples.length*.7)return fallback();
  const points=tracked.filter(Boolean), gap=(end-start)/samples.length;
  if(points.some((p,i)=>i && p.time-points[i-1].time>gap*3.1))return fallback();
  // A swing needs a clear rise, drop, then rise. A static pose or a partial
  // range still gets visual frames, without invented golf-phase labels.
  let best=null;
  for(let top=2;top<points.length-4;top++) {
    if(points[top].y>points[top-1].y || points[top].y>points[top+1].y)continue;
    let address=0;
    for(let i=1;i<top;i++)if(points[i].y>points[address].y)address=i;
    for(let impact=top+2;impact<points.length-2;impact++) {
      if(points[impact].y<points[impact-1].y || points[impact].y<points[impact+1].y)continue;
      let finish=impact+1;
      for(let i=impact+2;i<points.length;i++)if(points[i].y<points[finish].y)finish=i;
      const rise=points[address].y-points[top].y, drop=points[impact].y-points[top].y, follow=points[impact].y-points[finish].y;
      if(rise<.45 || drop<.45 || follow<.35 || address>=top-1 || finish<=impact+1)continue;
      const score=Math.min(rise,drop,follow);
      if(!best || score>best.score)best={address,top,impact,finish,score};
    }
  }
  if(!best)return fallback();
  const {address,top,impact,finish}=best;
  const indices=[address,top,Math.round((top+impact)/2),impact,Math.round((impact+finish)/2),finish];
  const times=indices.map(i=>snap(points[i].time));
  if(times.some((t,i)=>i && t<=times[i-1]))return fallback();
  return KEY_MOMENTS.map(([key,label],i)=>({key,label,time:times[i],source:'estimated'}));
}

// User edits always win, including when analysis is rerun or FPS is corrected.
export function keyMomentEntries(slot) {
  return KEY_MOMENTS.map(([key,label])=>{
    if(Number.isFinite(slot.marks[key]))return {key,label,time:slot.marks[key],source:'marked'};
    return {...(slot.keyMoments?.find(item=>item.key===key) ?? {key,label,time:null,source:'empty'})};
  });
}
