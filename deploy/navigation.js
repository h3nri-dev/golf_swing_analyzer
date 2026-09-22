import {keyMomentEntries,MOMENT_COLORS,KEY_MOMENTS} from './keyframes.js';
import {frameStamp,realTime,seconds} from './timing.js';
import {timelineBounds,markerLayout} from './timeline.js';

export function createMomentNavigation({slots,state,jump,jumpCommon,select,loop,changed}) {
  const $=id=>document.getElementById(id);
  const loopButton=document.createElement('button');loopButton.id='loopRange';loopButton.textContent='Loop window';loopButton.setAttribute('aria-pressed','false');
  $('rangeReset').before(loopButton);loopButton.onclick=loop;
  const layers=[...slots.map(s=>({slot:s,track:s.get('.clip-timeline'),host:s.get('.clip-transport')})),{track:$('timeline'),host:$('commonPlayer')}].map(item=>{
    const wrapper=document.createElement('div');wrapper.className='timeline-review';item.track.before(wrapper);
    const controls=document.createElement('div');controls.className='timeline-focus-controls';controls.hidden=true;
    controls.innerHTML='<div class="timeline-scopes" role="group"><button type="button" class="timeline-range">Analyzed range</button><button type="button" class="timeline-full">Full video</button></div><span class="timeline-bounds"></span><button type="button" class="timeline-toggle">Full video</button>';
    const layer=document.createElement('div');layer.className='timeline-moments';wrapper.append(controls,layer,item.track);
    if(!item.slot)item.host.append(controls);
    const view={...item,wrapper,controls,layer,focused:false,signature:'',layoutSignature:''};
    controls.querySelector('.timeline-range').onclick=()=>{view.focused=true;render();changed();};
    controls.querySelector('.timeline-full').onclick=()=>{view.focused=false;render();changed();};
    controls.querySelector('.timeline-toggle').onclick=()=>{view.focused=!view.focused;render();changed();};
    return view;
  });
  function render() {
    const {active,mode,busy,controller}=state(),slot=slots[active];
    loopButton.textContent=`Loop${mode==='compare'?` ${active?'B':'A'}`:''} window`;loopButton.setAttribute('aria-pressed',!!slot.loop);loopButton.disabled=busy||!slot.ready||!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||slot.start<0||slot.end<=slot.start||slot.end>slot.video.duration;
    loopButton.title='Repeat this window. Turning on pins its start and end; use the player to start playback.';
    layers.forEach((item,i)=>{
      const index=i<2?i:mode==='compare'?controller.clock:active,s=slots[index],{track,host,layer,wrapper,controls}=item;
      const bounds=timelineBounds(s,item.focused),time=i<2?s.video.currentTime:controller.time;
      const compact=i<2&&matchMedia('(min-width:901px) and (max-height:900px)').matches;
      const controlsHost=i===2||compact?host:wrapper;
      if(controls.parentElement!==controlsHost)controlsHost.prepend(controls);
      const rate=i<2?1:controller.rate;
      const toReal=i<2?t=>realTime(t,s):t=>t/rate;
      // Scope changes affect the view only; neither playhead nor transport state moves.
      track.min=toReal(bounds.start);track.max=toReal(bounds.end)||1;track.value=toReal(time||0);
      controls.hidden=!bounds.available;wrapper.classList.toggle('has-review',bounds.available&&!compact);wrapper.classList.toggle('is-focused',bounds.focused&&!compact);host.classList.toggle('has-timeline-review',bounds.available&&!compact);host.classList.toggle('timeline-compact',bounds.available&&compact);
      controls.querySelector('.timeline-scopes').setAttribute('aria-label',`${i===2&&mode==='compare'?'Both videos':mode==='compare'?`Swing ${index?'B':'A'}`:'Video'} timeline view`);
      controls.querySelector('.timeline-range').setAttribute('aria-pressed',bounds.focused);
      controls.querySelector('.timeline-full').setAttribute('aria-pressed',!bounds.focused);
      controls.querySelectorAll('button').forEach(b=>b.disabled=busy);
      controls.querySelector('.timeline-bounds').textContent=`${seconds(toReal(bounds.start))}–${seconds(toReal(bounds.end))} s${bounds.focused?` · ${(s.video.duration/(bounds.end-bounds.start)).toFixed(1).replace('.0','')}×`:''}`;
      const toggle=controls.querySelector('.timeline-toggle');toggle.textContent=bounds.focused?'Full video':'Analyzed range';toggle.title=`Timeline: ${seconds(toReal(bounds.start))}–${seconds(toReal(bounds.end))} real seconds. Show ${bounds.focused?'the full video':'the analyzed range'}.`;toggle.setAttribute('aria-label',`${toggle.textContent} timeline${mode==='compare'?` for swing ${index?'B':'A'}`:''}`);
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
      if(bounds.available&&!compact){
        layer.style.left=layer.style.top=layer.style.width='';
        if(layoutSignature!==item.layoutSignature){
          const layout=markerLayout(entries,bounds,box.width,bounds.focused?24:12);
          const lanes=bounds.focused?Math.max(0,...layout.map(e=>e.lane+1)):0;
          layer.style.height=`${lanes*26}px`;
          layer.querySelector('svg')?.remove();
          if(bounds.focused&&lanes){
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','100%');svg.setAttribute('height',String(lanes*26+12));svg.setAttribute('aria-hidden','true');
            for(const marker of layout){const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${marker.center} ${marker.lane*26+24} L${marker.anchor} ${lanes*26+9} v3`);line.setAttribute('stroke',MOMENT_COLORS[marker.key]);line.setAttribute('fill','none');svg.append(line);}
            layer.prepend(svg);
          }
          for(const marker of layout){const button=layer.querySelector(`[data-key="${marker.key}"]`);if(!button)continue;
            button.style.left=`${bounds.focused?marker.center:marker.anchor}px`;button.style.top=bounds.focused?`${marker.lane*26}px`:'-4px';
          }
        }
      }else{
        const parent=host.getBoundingClientRect();layer.style.height='8px';layer.style.left=`${box.left-parent.left+(compact?0:7)}px`;layer.style.top=`${box.top-parent.top+box.height/2-13}px`;layer.style.width=`${Math.max(0,box.width-(compact?0:14))}px`;
        if(compact&&layoutSignature!==item.layoutSignature){
          layer.querySelector('svg')?.remove();
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','100%');svg.setAttribute('height','14');svg.setAttribute('aria-hidden','true');
          for(const marker of markerLayout(entries,bounds,box.width,12)){
            const button=layer.querySelector(`[data-key="${marker.key}"]`);button.style.left=`${marker.center}px`;button.style.top='';
            const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${marker.center} 12 L${marker.anchor} 13`);line.setAttribute('stroke',MOMENT_COLORS[marker.key]);svg.append(line);
          }
          layer.prepend(svg);
        }else if(!compact)for(const button of layer.querySelectorAll('button')){button.style.left=`${(Number(button.dataset.time)-bounds.start)/(bounds.end-bounds.start)*100}%`;button.style.top='';}
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
