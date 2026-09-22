import {analysisWindow,DEFAULT_WINDOW_SECONDS} from './range.js';
import {keyMomentEntries,MOMENT_COLORS,KEY_MOMENTS} from './keyframes.js';
import {frameStamp,realTime,seconds} from './timing.js';
import {timelineBounds,markerLayout} from './timeline.js';

export function createMomentNavigation({slots,state,jump,jumpCommon,select,loop,changed}) {
  const $=id=>document.getElementById(id);
  const loopButton=document.createElement('button');loopButton.id='loopRange';loopButton.textContent='Loop window';loopButton.setAttribute('aria-pressed','false');
  $('restart').before(loopButton);loopButton.onclick=loop;
  const layers=[...slots.map(s=>({slot:s,track:s.get('.clip-timeline'),host:s.get('.clip-transport')})),{track:$('timeline'),host:$('commonPlayer')}].map(item=>{
    const wrapper=document.createElement('div');wrapper.className='timeline-review';item.track.before(wrapper);
    const controls=document.createElement('div');controls.className='timeline-focus-controls';controls.hidden=true;
    controls.innerHTML='<div class="timeline-scopes" role="group"><button type="button" class="timeline-range">Analyzed range</button><button type="button" class="timeline-full">Full video</button></div><span class="timeline-bounds"></span>';
    const layer=document.createElement('div');layer.className='timeline-moments';
    const scrubber=document.createElement('div');scrubber.className='timeline-scrubber';
    const rail=document.createElement('div');rail.className='timeline-rail';rail.setAttribute('aria-hidden','true');
    rail.innerHTML='<span class="timeline-window"></span><span class="timeline-playhead"></span>';
    scrubber.append(rail,item.track);wrapper.append(controls,layer,scrubber);
    item.track.setAttribute('aria-describedby','analysisWindowHint');
    item.track.addEventListener('keydown',e=>{
      if(state().busy||e.altKey||e.ctrlKey||e.metaKey)return;
      const directions={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:1,PageDown:-1};
      if(!(e.key in directions)&&!['Home','End'].includes(e.key))return;
      e.preventDefault();
      const controller=state().controller,index=item.slot?slots.indexOf(item.slot):controller.clock,s=slots[index];
      if(!s.ready)return;
      const rate=item.slot?(s.shotFps??s.fps)/s.fps:controller.rate;
      const step=e.key.startsWith('Page')||e.shiftKey?rate:1/(item.slot?s.fps:controller.fps);
      const from=item.slot?s.video.currentTime:controller.time,bounds=timelineBounds(s,view.focused);
      const at=e.key==='Home'?bounds.start:e.key==='End'?bounds.end:Math.max(bounds.start,Math.min(bounds.end,from+directions[e.key]*step));
      item.slot?jump(index,at):jumpCommon(at);
    });
    if(!item.slot)item.host.querySelector('.timeline-description').append(controls);
    const view={...item,wrapper,controls,layer,rail,focused:false,signature:'',layoutSignature:''};
    controls.querySelector('.timeline-range').onclick=()=>{view.focused=true;render();changed();};
    controls.querySelector('.timeline-full').onclick=()=>{view.focused=false;render();changed();};
    return view;
  });
  function render() {
    const {active,mode,busy,controller}=state(),slot=slots[active];
    loopButton.textContent=`Loop${mode==='compare'?` ${active?'B':'A'}`:''} window`;loopButton.setAttribute('aria-pressed',!!slot.loop);loopButton.disabled=busy||!slot.ready||!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||slot.start<0||slot.end<=slot.start||slot.end>slot.video.duration;
    loopButton.title=slot.loop?`Stop repeating ${seconds(realTime(slot.loop[0],slot))}–${seconds(realTime(slot.loop[1],slot))} real seconds.`:'Repeat the current green window. Its loop boundaries stay fixed while the analysis window follows playback.';
    layers.forEach((item,i)=>{
      const index=i<2?i:mode==='compare'?controller.clock:active,s=slots[index],{track,host,layer,wrapper,controls}=item;
      const bounds=timelineBounds(s,item.focused),time=busy?s.windowCenter||0:i<2?s.video.currentTime:controller.time;
      const compact=i<2&&bounds.available&&matchMedia('(min-width:901px) and (max-height:820px)').matches;
      const controlsHost=i===2?host.querySelector('.timeline-description'):compact?host:wrapper;
      if(i<2){const duration=s.get('.clip-duration'),parent=compact?host:s.get('.clip-timeline-row');if(duration.parentElement!==parent)parent.append(duration);}
      host.classList.toggle('timeline-compact',compact);
      if(controls.parentElement!==controlsHost)controlsHost.prepend(controls);
      const rate=i<2?1:controller.rate;
      const toReal=i<2?t=>realTime(t,s):t=>t/rate;
      // Scope changes affect the view only; neither playhead nor transport state moves.
      track.min=toReal(bounds.start);track.max=toReal(bounds.end)||1;track.value=toReal(time||0);
      const windowRate=i<2?(s.shotFps??s.fps)/s.fps:controller.rate;
      const [start,end]=busy?[s.start,s.end]:analysisWindow(time,s.ready?s.video.duration:0,DEFAULT_WINDOW_SECONDS*windowRate);
      const percent=t=>Math.max(0,Math.min(100,(t-bounds.start)/(bounds.end-bounds.start||1)*100));
      item.rail.hidden=!s.ready;
      const band=item.rail.querySelector('.timeline-window');
      band.style.left=`${percent(start)}%`;band.style.width=`${percent(end)-percent(start)}%`;
      item.rail.querySelector('.timeline-playhead').style.left=`${percent(time)}%`;
      item.rail.dataset.start=start;item.rail.dataset.end=end;item.rail.dataset.time=time;
      track.title='Drag to seek and move the green ±2.5 real-second analysis window. Arrow keys: one frame; Shift + arrow: one second.';
      controls.hidden=!bounds.available;wrapper.classList.toggle('has-review',bounds.available&&!compact);wrapper.classList.toggle('is-focused',bounds.focused&&!compact);host.classList.toggle('has-timeline-review',bounds.available);
      controls.querySelector('.timeline-scopes').setAttribute('aria-label',`${i===2&&mode==='compare'?'Both videos':mode==='compare'?`Swing ${index?'B':'A'}`:'Video'} timeline view`);
      controls.querySelector('.timeline-range').setAttribute('aria-pressed',bounds.focused);
      controls.querySelector('.timeline-full').setAttribute('aria-pressed',!bounds.focused);
      controls.querySelectorAll('button').forEach(b=>b.disabled=busy);
      controls.querySelector('.timeline-bounds').textContent=`${seconds(toReal(bounds.start))}–${seconds(toReal(bounds.end))} s${bounds.focused?` · ${(s.video.duration/(bounds.end-bounds.start)).toFixed(1).replace('.0','')}×`:''}`;
      const outside=bounds.focused&&!busy&&(time<bounds.start-1/s.fps||time>bounds.end+1/s.fps);
      host.classList.toggle('playhead-outside',outside);
      controls.querySelector('.timeline-full').title=outside?'The playhead is outside this analysis window. Show the full video timeline.':'Show the full video timeline without moving the playhead';
      const entries=keyMomentEntries(s).filter(e=>Number.isFinite(e.time)&&e.source!=='sampled');
      const signature=JSON.stringify([index,mode,busy,s.ready,s.fps,s.shotFps,bounds,compact,entries]);
      if(signature!==item.signature){item.signature=signature;layer.replaceChildren();
        for(const entry of entries.filter(e=>e.time>=bounds.start&&e.time<=bounds.end)){const button=document.createElement('button');button.type='button';button.dataset.key=entry.key;button.dataset.time=entry.time;button.style.setProperty('--moment-color',MOMENT_COLORS[entry.key]);
          button.textContent=bounds.focused&&!compact?String(KEY_MOMENTS.findIndex(([key])=>key===entry.key)+1):'';
          button.title=`${entry.label} · ${frameStamp(entry.time,s)}`;button.setAttribute('aria-label',`Jump to ${entry.label}${mode==='compare'?` in swing ${index?'B':'A'}`:''} on timeline`);button.disabled=busy;
          button.onclick=()=>i===2?jumpCommon(entry.time):jump(index,entry.time);layer.append(button);
        }
      }
      const box=track.getBoundingClientRect();layer.hidden=!s.ready||!box.width;
      const layoutSignature=`${signature}:${box.width}`;
      if(layoutSignature!==item.layoutSignature){
        const expanded=bounds.focused&&!compact;
        const layout=markerLayout(entries,bounds,box.width,expanded?24:12);
        const lanes=expanded?Math.max(0,...layout.map(e=>e.lane+1)):0;
        layer.style.height=`${lanes*26}px`;
        layer.querySelector('svg')?.remove();
        if(expanded&&lanes){
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','100%');svg.setAttribute('height',String(lanes*26+12));svg.setAttribute('aria-hidden','true');
          for(const marker of layout){const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${marker.center} ${marker.lane*26+24} L${marker.anchor} ${lanes*26+9} v3`);line.setAttribute('stroke',MOMENT_COLORS[marker.key]);line.setAttribute('fill','none');svg.append(line);}
          layer.prepend(svg);
        } else if(compact&&layout.length) {
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','100%');svg.setAttribute('height','16');svg.setAttribute('aria-hidden','true');
          for(const marker of layout){const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${marker.center} 10 L${marker.anchor} 16`);line.setAttribute('stroke',MOMENT_COLORS[marker.key]);line.setAttribute('fill','none');svg.append(line);}
          layer.prepend(svg);
        }
        for(const marker of layout){const button=layer.querySelector(`[data-key="${marker.key}"]`);if(!button)continue;
          button.style.left=`${expanded||compact?marker.center:marker.anchor}px`;button.style.top=expanded?`${marker.lane*26}px`:'0px';
        }
      }
      item.layoutSignature=layoutSignature;
    });
  }
  document.addEventListener('keydown',e=>{
    if(state().busy||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable]'))return;
    const {active,mode}=state();
    if(e.key==='?'){e.preventDefault();$('workspaceHelp').click();}
    if(mode==='compare'&&['1','2'].includes(e.key)){e.preventDefault();select(Number(e.key)-1);}
    if(['[',']'].includes(e.key)){
      e.preventDefault();const s=slots[active],entries=keyMomentEntries(s).filter(e=>Number.isFinite(e.time)&&e.source!=='sampled').sort((a,b)=>a.time-b.time);
      const direction=e.key===']'?1:-1;
      const entry=(direction>0?entries:entries.reverse()).find(e=>(e.time-s.video.currentTime)*direction>.5/s.fps);if(entry)jump(active,entry.time);
    }
  });
  return {render,isFocused(index){return timelineBounds(slots[index],layers[2].focused&&state().controller.clock===index).focused;},focusAnalysis(index){layers[index].focused=true;layers[2].focused=true;},reset(index){layers[index].focused=false;}};
}
