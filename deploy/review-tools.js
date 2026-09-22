import {MEASUREMENTS,measurements,nearestSample} from './analysis.js';
import {currentMoment,postureNotes} from './review.js';
import {MOMENT_COLORS} from './keyframes.js';

export function createReviewTools({slots,state,changed,cropChanged}) {
  const $=id=>document.getElementById(id),pose=$('panel-pose');
  const visibility=document.createElement('button');visibility.id='poseVisibility';visibility.textContent='Hide overlays';pose.querySelector('.section-heading').append(visibility);
  visibility.onclick=()=>{const s=slots[state().active];s.review.visible=!s.review.visible;changed();};
  document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!state().busy&&!document.querySelector('dialog[open]')&&!e.target.closest('input,select,textarea,[contenteditable]')){e.preventDefault();visibility.click();}});
  const options=pose.querySelector('.overlay-options');
  options.innerHTML='<div class="review-checks"><label><input id="skeleton" type="checkbox">Skeleton</label><label><input id="landmarks" type="checkbox">Joints</label><label><input id="poseAngles" type="checkbox">Angles</label><label><input id="guideLines" type="checkbox">Grid</label></div><div class="review-checks path-checks"><span>Paths</span><label><input id="headPath" type="checkbox">Head</label><label><input id="trail" type="checkbox">Lead hand</label><label><input id="trailPath" type="checkbox">Trail hand</label></div><div class="review-size"><label>Overlay size <input id="overlaySize" aria-label="Pose overlay size" type="range" min="1" max="6" step="0.5"></label><select id="pathLength" aria-label="Trajectory length"><option value="swing">Whole swing path</option><option value="recent">Recent 1.5 seconds</option></select></div>';
  const bindings={skeleton:'skeleton',landmarks:'landmarks',poseAngles:'angles',guideLines:'grid',headPath:'head',trail:'lead',trailPath:'trail'};
  for(const [id,key] of Object.entries(bindings))$(id).onchange=e=>{slots[state().active].review[key]=e.target.checked;changed();};
  $('overlaySize').oninput=e=>{slots[state().active].review.size=Number(e.target.value);changed();};
  $('pathLength').onchange=e=>{slots[state().active].review.path=e.target.value;changed();};
  $('panel-draw').querySelector('.section-heading').append($('panel-draw').querySelector('.drawing-footer'));
  const metrics=$('metrics');metrics.classList.add('review-metrics');
  const table=rows=>'<table aria-label="Pose measurements"><thead><tr><th title="2D image angle; not 3D rotation">2D angle</th><th data-column="a">Now</th><th data-column="b">B</th><th data-column="delta">Δ B−A</th></tr></thead><tbody>'+rows.map(([key,label])=>`<tr data-metric="${key}"><th scope="row">${label}</th><td id="${key}"></td><td data-value="b"></td><td data-value="delta"></td></tr>`).join('')+'</tbody></table>';
  metrics.innerHTML='<div class="review-tables">'+table(MEASUREMENTS.slice(0,4))+table(MEASUREMENTS.slice(4))+'</div><div class="review-coverage">Pose coverage <strong id="coverage">—</strong><span id="sampleCount"></span></div>';
  const hand=pose.querySelector('.setting-row');hand.querySelector('label').textContent='Hand';pose.querySelector('.section-heading').insertBefore(hand,visibility);
  const feedback=document.createElement('div');feedback.className='posture-feedback';feedback.innerHTML='<strong id="currentMoment"></strong><p id="postureNotes"></p>';metrics.after(feedback);
  pose.querySelector('.metric-note').textContent='2D image angles, not 3D rotation. Compare similar camera views.';
  $('panel-video').querySelectorAll('[data-settings-slot]').forEach((group,i)=>{
    const controls=document.createElement('div');controls.className='review-video-options';
    controls.innerHTML='<label>Video area <select class="video-crop"><option value="full">Full frame</option><option value="left">Left half</option><option value="right">Right half</option></select></label><label>Analysis <select class="analysis-quality"><option value="fast">Fast</option><option value="detailed">Detailed</option></select></label>';
    controls.querySelector('.analysis-quality').title='Fast: up to 240 samples with a lightweight model. Detailed: up to 2,400 samples at File FPS with a larger pose model; takes longer.';
    group.append(controls);
    controls.querySelector('.video-crop').onchange=e=>cropChanged(i,e.target.value);
    controls.querySelector('.analysis-quality').onchange=e=>{slots[i].quality=e.target.value;changed();};
  });
  const videoHelp=$('panel-video').querySelector('.screen-panel-help');videoHelp.textContent='Detailed uses a larger pose model and samples up to 2,400 frames.';
  const ghost=document.createElement('div');ghost.className='ghost-options';ghost.innerHTML='<label><input id="ghostOverlay" type="checkbox">Overlay B’s pose on A</label><label>Opacity <input id="ghostOpacity" aria-label="Reference pose opacity" type="range" min="0.1" max="1" step="0.05" value="0.4"></label>';
  $('panel-video').append(ghost);
  $('ghostOverlay').onchange=$('ghostOpacity').oninput=changed;
  function render() {
    const {active,mode,busy}=state(),slot=slots[active],compare=mode==='compare';
    visibility.textContent=slot.review.visible?'Hide overlays':'Show overlays';visibility.setAttribute('aria-pressed',slot.review.visible);visibility.disabled=busy||!slot.ready;
    for(const [id,key] of Object.entries(bindings)){$(id).checked=slot.review[key];$(id).disabled=busy;}
    $('overlaySize').value=slot.review.size;$('pathLength').value=slot.review.path;
    $('overlaySize').disabled=$('pathLength').disabled=busy;
    ghost.hidden=!compare;$('ghostOverlay').disabled=busy||!slots.every(s=>s.samples.length);$('ghostOpacity').disabled=busy||!$('ghostOverlay').checked;
    $('panel-video').querySelectorAll('[data-settings-slot]').forEach((group,i)=>{
      const prefix=compare?`Swing ${i?'B':'A'} `:'';
      for(const [selector,key,label] of [['.video-crop','crop','video area'],['.analysis-quality','quality','analysis quality']]){
        const input=group.querySelector(selector);input.value=slots[i][key];input.disabled=busy||!slots[i].ready;input.setAttribute('aria-label',prefix+label);
      }
    });
    const values=slots.map(s=>measurements(nearestSample(s.samples,s.video.currentTime,s.tolerance)?.points,s.video.videoWidth,s.video.videoHeight,s.hand));
    const stamp=value=>Number.isFinite(value)?`${Math.round(value)}°`:'—';
    metrics.querySelectorAll('[data-column=a]').forEach(cell=>cell.textContent=compare?'A':'Now');
    for(const cell of metrics.querySelectorAll('[data-column=b],[data-column=delta],[data-value]'))cell.hidden=!compare;
    for(const [key] of MEASUREMENTS){
      const row=metrics.querySelector(`[data-metric=${key}]`),a=values[compare?0:active][key],b=values[1][key];
      row.querySelector('td').textContent=stamp(a);row.querySelector('[data-value=b]').textContent=stamp(b);
      const delta=Number.isFinite(a)&&Number.isFinite(b)?b-a:null;
      row.querySelector('[data-value=delta]').textContent=delta===null?'—':`${delta>=0?'+':''}${Math.round(delta)}°`;
    }
    const moment=currentMoment(slot),title=$('currentMoment');title.textContent=moment?`${moment.label} · ${moment.source==='marked'?'Your mark':'Auto estimate'}`:'Frame observations';
    title.style.borderColor=moment?MOMENT_COLORS[moment.key]:'#899680';
    feedback.hidden=!slot.samples.length;$('postureNotes').textContent=postureNotes(slot,slot.video.currentTime).join(' ');
    $('sampleCount').textContent=slot.samples.length?`${slot.samples.length} frames sampled`:'';
  }
  return {render,ghost:()=>({enabled:state().mode==='compare'&&$('ghostOverlay').checked,opacity:Number($('ghostOpacity').value)})};
}
