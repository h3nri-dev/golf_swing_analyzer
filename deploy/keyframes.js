import { visible } from './analysis.js';
import { frameNumber, lastFrame } from './timing.js';

export const KEY_MOMENTS = [
  ['address','Address'],['top','Top of backswing'],['downswing','Downswing'],
  ['impact','Impact'],['follow','Follow-through'],['finish','Finish']
];
export const PRIMARY_MOMENTS = KEY_MOMENTS.filter(([key])=>!['downswing','follow'].includes(key));
// Shared by player markers, frame previews, editing and PDF reports. Labels and
// numbers accompany these accents so color is never the only identifier.
export const MOMENT_COLORS = {address:'#287749',top:'#7952ad',downswing:'#ad6415',impact:'#c43e46',follow:'#137e91',finish:'#af397b'};
export const MOMENT_NAMES = {address:'Address',top:'Top',downswing:'Downswing',impact:'Impact',follow:'Follow-through',finish:'Finish'};
export const momentSource = source => ({marked:'Your mark',estimated:'Auto estimate',sampled:'Range preview',empty:'Not set'})[source];

// Recover the original hand-path phase sequence, but evaluate each continuous
// swing locally: idle/occluded tails must not invalidate a visible swing.
// Times remain file coordinates; timing limits use real seconds for slow-mo.
export function suggestKeyMoments(samples, start, end, fps, {anchor=(start+end)/2, rate=1}={}) {
  const snap=time=>Math.max(start,Math.min(lastFrame(end,fps)/fps,frameNumber(time,fps)/fps));
  const fallback=()=>KEY_MOMENTS.map(([key],i)=>({key,time:snap(start+(end-start)*i/5),source:'sampled',label:`Range frame ${i+1}`}));
  if(samples.length<12)return fallback();
  rate=Number.isFinite(rate)&&rate>0?rate:1;
  const tracked=samples.map(sample=>{
    const p=sample.points;
    if(!p)return null;
    const shoulders=[11,12].filter(i=>visible(p[i])),hips=[23,24].filter(i=>visible(p[i])),wrists=[15,16].filter(i=>visible(p[i]));
    if(!shoulders.length||!hips.length||!wrists.length)return null;
    const mean=(indices,axis)=>indices.reduce((sum,i)=>sum+p[i][axis],0)/indices.length;
    const hip=mean(hips,'y'),torso=hip-mean(shoulders,'y');
    return torso>.05?{time:sample.time,y:(mean(wrists,'y')-hip)/torso,observed:true}:null;
  });
  // Bridge only brief tracking dropouts inside a run, never a long occlusion.
  for(let i=1;i<tracked.length-1;i++){
    if(tracked[i]||!tracked[i-1])continue;
    let next=i;while(next<tracked.length&&!tracked[next])next++;
    if(next-i>2||next===tracked.length||(samples[next].time-samples[i-1].time)/rate>.16)continue;
    const a=tracked[i-1],b=tracked[next];
    for(let j=i;j<next;j++){const time=samples[j].time;tracked[j]={time,y:a.y+(b.y-a.y)*(time-a.time)/(b.time-a.time),observed:false};}
  }
  const gaps=samples.slice(1).map((s,i)=>s.time-samples[i].time).filter(t=>t>0).sort((a,b)=>a-b);
  const cadence=gaps[Math.floor(gaps.length/2)]||1/fps;
  const runs=[];let run=[];
  for(const p of tracked){
    if(!p||(run.length&&p.time-run.at(-1).time>cadence*2.5)){if(run.length)runs.push(run);run=[];}
    if(p)run.push(p);
  }
  if(run.length)runs.push(run);
  let best=null;
  for(const points of runs){
    if(points.length<12)continue;
    // A median removes isolated tracking spikes without moving sharp extrema.
    const y=points.map((p,i)=>i&&i<points.length-1?[points[i-1].y,p.y,points[i+1].y].sort((a,b)=>a-b)[1]:p.y);
    const elapsed=(a,b)=>(points[b].time-points[a].time)/rate;
    for(let top=2;top<points.length-5;top++){
      if(y[top]>-.5||y[top]>y[top-1]||y[top]>y[top+1]||y[top]===y[top-1])continue;
      let base=top-1;
      for(let i=top-2;i>=0&&elapsed(i,top)<=3;i--){
        if(y[i]<y[base]-.3&&y[base]-y[top]>.45)break;
        if(y[i]>y[base])base=i;
      }
      const rise=y[base]-y[top];if(rise<.45)continue;
      // Last address-like frame before takeaway; exclude a long idle lead-in.
      let address=base;
      for(let i=base+1;i<top-1;i++)if(y[i]>=y[base]-.08*rise)address=i;
      if(top-address<2)continue;
      for(let impact=top+2;impact<points.length-3&&elapsed(top,impact)<=1.5;impact++){
        if(y[impact]<y[impact-1]||y[impact]<y[impact+1]||y[impact]===y[impact-1])continue;
        let finish=impact+1;
        for(let i=impact+2;i<points.length&&elapsed(impact,i)<=3;i++){
          if(y[i]<y[finish])finish=i;
          // End at the first high follow-through, before a reset/second swing.
          if(i>finish&&y[i]>y[finish]+.25)break;
        }
        const drop=y[impact]-y[top],follow=y[impact]-y[finish];
        if(drop<.45||follow<.35||finish-impact<2)continue;
        const segment=points.slice(address,finish+1);
        if(segment.filter(p=>p.observed).length/segment.length<.75)continue;
        // Prefer the complete swing nearest the frame the user chose to analyze.
        const distance=Math.abs(points[impact].time-anchor)/rate;
        const score=Math.min(rise,drop,follow)/(1+distance*.15);
        if(!best||score>best.score)best={points,address,top,impact,finish,score};
        // Consume this complete sequence before looking for another swing.
        // A follow-through or reset must not become the next backswing apex.
        top=finish;break;
      }
    }
  }
  if(!best)return fallback();
  const {points,address,top,impact,finish}=best;
  // Refine extrema against the original samples after spike-resistant selection.
  const extremum=(index,min)=>{
    const candidates=[index-1,index,index+1].filter(i=>i>=0&&i<points.length&&points[i].observed);
    return candidates.reduce((a,b)=>(min?points[b].y<points[a].y:points[b].y>points[a].y)?b:a,index);
  };
  const apex=extremum(top,true),contact=extremum(impact,false),endSwing=extremum(finish,true);
  const indices=[address,apex,Math.round((apex+contact)/2),contact,Math.round((contact+endSwing)/2),endSwing];
  const times=indices.map(i=>snap(points[i].time));
  if(times.some((t,i)=>i&&t<=times[i-1]))return fallback();
  return KEY_MOMENTS.map(([key,label],i)=>({key,label,time:times[i],source:'estimated'}));
}

export function keyMomentEntries(slot) {
  return KEY_MOMENTS.map(([key,label])=>{
    if(Number.isFinite(slot.marks[key]))return {key,label,time:slot.marks[key],source:'marked'};
    return {...(slot.keyMoments?.find(item=>item.key===key)??{key,label,time:null,source:'empty'})};
  });
}
// Range previews are navigation aids, never swing phases or tempo inputs.
export function phaseTimes(slot) {
  return Object.fromEntries(keyMomentEntries(slot).filter(e=>['marked','estimated'].includes(e.source)&&Number.isFinite(e.time)).map(e=>[e.key,e.time]));
}
