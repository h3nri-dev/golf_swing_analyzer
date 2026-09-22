import {keyMomentEntries,MOMENT_COLORS} from './keyframes.js';
import {frameStamp} from './timing.js';

export function createMomentNavigation({slots,state,jump,select,loop}) {
  const $=id=>document.getElementById(id);
  const loopButton=document.createElement('button');loopButton.id='loopRange';loopButton.textContent='Loop window';loopButton.setAttribute('aria-pressed','false');
  $('rangeReset').before(loopButton);loopButton.onclick=loop;
  const layers=[...slots.map(s=>({slot:s,track:s.get('.clip-timeline'),host:s.get('.clip-transport')})),{track:$('timeline'),host:$('commonPlayer')}].map(item=>{
    const layer=document.createElement('div');layer.className='timeline-moments';item.host.append(layer);return {...item,layer,signature:''};
  });
  function render() {
    const {active,mode,busy,clock}=state(),slot=slots[active];
    loopButton.textContent=`Loop${mode==='compare'?` ${active?'B':'A'}`:''} window`;loopButton.setAttribute('aria-pressed',!!slot.loop);loopButton.disabled=busy||!slot.ready||!Number.isFinite(slot.start)||!Number.isFinite(slot.end)||slot.start<0||slot.end<=slot.start||slot.end>slot.video.duration;
    loopButton.title='Repeat this window. Turning on pins its start and end; use the player to start playback.';
    layers.forEach((item,i)=>{
      const index=i<2?i:mode==='compare'?clock:active,s=slots[index],{track,host,layer}=item;
      const entries=keyMomentEntries(s).filter(e=>Number.isFinite(e.time)&&e.source!=='sampled');
      const signature=JSON.stringify([index,mode,busy,s.ready,s.fps,s.shotFps,entries]);
      if(signature!==item.signature){item.signature=signature;layer.replaceChildren();
        for(const entry of entries){const button=document.createElement('button');button.type='button';button.style.left=`${entry.time/s.video.duration*100}%`;button.style.setProperty('--moment-color',MOMENT_COLORS[entry.key]);
          button.title=`${entry.label} · ${frameStamp(entry.time,s)}`;button.setAttribute('aria-label',`Jump to ${entry.label}${mode==='compare'?` in swing ${index?'B':'A'}`:''} on timeline`);button.disabled=busy;
          button.onclick=()=>jump(index,entry.time);layer.append(button);
        }
      }
      const box=track.getBoundingClientRect(),parent=host.getBoundingClientRect();layer.hidden=!s.ready||!box.width;
      layer.style.left=`${box.left-parent.left+7}px`;layer.style.top=`${box.top-parent.top+box.height/2-13}px`;layer.style.width=`${Math.max(0,box.width-14)}px`;
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
  return {render};
}
