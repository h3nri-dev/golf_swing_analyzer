import { KEY_MOMENTS, keyMomentEntries, MOMENT_COLORS, momentSource, MOMENT_NAMES } from './keyframes.js';
import { frameNumber, frameStamp, lastFrame } from './timing.js';
import { drawReview, cropRegion, postureNotes, currentMoment } from './review.js';
import { nearestSample, measurements } from './analysis.js';

const sourceLabel=momentSource;
const name=i=>i?'B':'A';

export function createKeyframeViews({slots,state,controlClip,seek,play,changed,paintDrawings,focusVideo,markMoment,editMoments,alignMoment}) {
  const strip=document.createElement('section');strip.id='keyMomentStrip';strip.className='key-moment-strip';strip.hidden=true;
  strip.setAttribute('aria-labelledby','keyMomentTitle');
  strip.innerHTML='<header><h2 id="keyMomentTitle">Key moments</h2><span>Click a frame to jump · Set replaces its moment</span><button class="moments-edit" data-edit-slot="0">Edit A</button><button class="moments-edit" data-edit-slot="1">Edit B</button><button class="key-overlay" aria-pressed="true">Overlay</button><button class="key-notes" aria-pressed="false">Notes</button><button class="key-enlarge">Enlarge & edit ↗</button></header><div class="key-filmstrip"></div><p class="key-strip-note"></p>';
  document.querySelector('.video-editor').append(strip);
  strip.querySelectorAll('[data-edit-slot]').forEach(b=>b.onclick=()=>editMoments(Number(b.dataset.editSlot)));
  const dialog=document.createElement('dialog');dialog.id='keyMomentDialog';dialog.className='key-review-dialog';dialog.setAttribute('aria-labelledby','keyReviewTitle');
  dialog.innerHTML='<header><div><span class="key-eyebrow">VISUAL SWING REVIEW</span><h2 id="keyReviewTitle">Key moment</h2></div><button class="key-review-close" aria-label="Close key moment view">×</button></header><nav aria-label="Key moments"></nav><p class="key-review-note">Estimates use hand movement, not ball contact. Check the frame and edit it below.</p><div class="key-review-panels"></div><p class="key-review-error" role="alert" hidden></p>';
  document.body.append(dialog);
  let previewsOverlay=true,notesVisible=false;
  strip.querySelector('.key-overlay').onclick=()=>{previewsOverlay=!previewsOverlay;strip.querySelector('.key-overlay').setAttribute('aria-pressed',previewsOverlay);lastVisual='';render(lastDrawings);};
  strip.querySelector('.key-notes').onclick=()=>{notesVisible=!notesVisible;strip.querySelector('.key-notes').setAttribute('aria-pressed',notesVisible);lastVisual='';signature='';render(lastDrawings);};
  let selected=0,signature='',drawingSignature='',lastDrawings='',paintVersion=0,lastVisual='';
  const caches=slots.map(()=>new Map()), workers=slots.map(()=>null), failed=slots.map(()=>new Set());
  const cellViews=[];
  const cards=KEY_MOMENTS.map(([key,label],position)=>{
    const card=document.createElement('article');card.className='key-card';card.dataset.key=key;
    const title=document.createElement('button');title.className='key-card-title';title.title='Enlarge and edit this moment';title.onclick=()=>open(position);
    const cells=document.createElement('div');cells.className='key-card-frames';card.append(title,cells);
    slots.forEach((s,i)=>{
      const cell=document.createElement('div');cell.className='moment-cell';cell.dataset.momentSlot=i;cell.dataset.moment=key;
      const button=document.createElement('button');button.className='key-frame';button.dataset.previewSlot=i;button.dataset.key=key;
      button.innerHTML='<span class="key-frame-image"><canvas></canvas><span class="key-frame-placeholder"></span><span class="key-slot-badge"></span></span><span class="key-frame-time"></span>';
      button.onclick=()=>jump(i,position,false);
      const mark=document.createElement('button');mark.className='moment-mark';mark.textContent=`Set ${name(i)}`;mark.setAttribute('aria-label',`Set ${label} here in swing ${name(i)}`);mark.title=`Replace ${label} with the frame currently displayed in swing ${name(i)}`;mark.onclick=()=>markMoment(i,key);
      const note=document.createElement('p');note.className='key-frame-note';cell.append(button,mark,note);cells.append(cell);cellViews.push({button,canvas:button.querySelector('canvas'),position,index:i});
    });
    const sync=document.createElement('button');sync.className='key-sync';sync.textContent='Sync';sync.setAttribute('aria-label',`Sync here at ${label}`);sync.title=`Synchronize both videos at ${label}`;sync.onclick=()=>alignMoment(key);cells.append(sync);
    strip.querySelector('.key-filmstrip').append(card);
    const nav=document.createElement('button');nav.textContent=`${position+1} ${label}`;nav.style.setProperty('--moment-color',MOMENT_COLORS[key]);nav.onclick=()=>{selected=position;renderDialog();};dialog.querySelector('nav').append(nav);
    return {card,title};
  });
  const panels=slots.map((s,index)=>{
    const panel=document.createElement('section');panel.className='key-review-panel';panel.dataset.reviewSlot=index;
    panel.innerHTML='<h3><span class="key-swing-label"></span> <span class="key-source"></span></h3><div class="key-large-frame"><canvas></canvas><p></p></div><div class="key-detail-line"><strong class="key-detail-time"></strong><span class="key-detail-metrics"></span></div><p class="key-posture-notes"></p><div class="key-edit-controls"><button class="key-frame-back">−1</button><label>Frame <input type="number" min="0" step="1"></label><button class="key-frame-next">+1</button><button class="key-set-current">Set from player</button></div><div class="key-review-actions"><button class="key-play-from">▶ Play from here</button><button class="key-draw-frame">Draw on frame ↗</button></div>';
    dialog.querySelector('.key-review-panels').append(panel);
    const input=panel.querySelector('input');
    const save=frame=>{
      if(state().busy || !s.ready)return;
      const error=dialog.querySelector('.key-review-error');
      if(!Number.isInteger(frame) || frame<0 || frame>lastFrame(s.video.duration,s.fps)) {error.textContent=`${state().mode==='compare'?`Swing ${name(index)}: enter`:'Enter'} a whole frame from 0 to ${lastFrame(s.video.duration,s.fps)}.`;error.hidden=false;input.setAttribute('aria-invalid','true');return;}
      error.hidden=true;input.removeAttribute('aria-invalid');s.marks[KEY_MOMENTS[selected][0]]=frame/s.fps;changed();renderDialog();
    };
    input.onchange=()=>save(input.valueAsNumber);
    panel.querySelector('.key-frame-back').onclick=()=>save(Math.max(0,input.valueAsNumber-1));
    panel.querySelector('.key-frame-next').onclick=()=>save(Math.min(lastFrame(s.video.duration,s.fps),input.valueAsNumber+1));
    panel.querySelector('.key-set-current').onclick=()=>save(frameNumber(s.video.currentTime,s.fps,s.video.duration));
    panel.querySelector('.key-play-from').onclick=()=>{dialog.close();jump(index,selected,true);};
    panel.querySelector('.key-draw-frame').onclick=()=>{dialog.close();jump(index,selected,false);document.querySelector('[data-tool="line"]').click();};
    return panel;
  });
  function jump(index,position,playing) {
    const entry=keyMomentEntries(slots[index])[position];if(!Number.isFinite(entry.time))return;
    controlClip(index,()=>{seek(entry.time);if(playing)play();});focusVideo();
  }
  function open(position) {if(state().busy)return;selected=position;dialog.querySelector('.key-review-error').hidden=true;dialog.showModal();renderDialog();}
  strip.querySelector('.key-enlarge').onclick=()=>open(selected);
  dialog.querySelector('.key-review-close').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',e=>{
    if(e.target.closest('input') || !['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();selected=(selected+(e.key==='ArrowRight'?1:KEY_MOMENTS.length-1))%KEY_MOMENTS.length;renderDialog();
  });
  const cacheKey=(s,time)=>`${s.url}:${time}`;
  const imageFor=(index,time)=>caches[index].get(cacheKey(slots[index],time));
  // Decode thumbnail frames independently. Seeking these previews must never
  // move either player, change sync, or interrupt another clip's playback.
  async function fillCache(index) {
    const s=slots[index];if(workers[index] || !s.ready || state().busy)return;
    const url=s.url,version=s.version;
    const missing=()=>keyMomentEntries(s).filter(e=>Number.isFinite(e.time) && !imageFor(index,e.time) && !failed[index].has(cacheKey(s,e.time)));
    if(!missing().length)return;
    const decoder=document.createElement('video');decoder.muted=true;decoder.playsInline=true;decoder.preload='auto';workers[index]=decoder;
    function wait(event,action) {
      return new Promise((resolve,reject)=>{
        const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Preview unavailable'));};
        const cleanup=()=>{clearTimeout(timer);decoder.removeEventListener(event,done);decoder.removeEventListener('error',fail);};
        const timer=setTimeout(fail,10000);decoder.addEventListener(event,done);decoder.addEventListener('error',fail);action();
      });
    }
    let current;
    try {
      await wait('loadeddata',()=>{decoder.src=url;});
      while(s.version===version && s.ready && !state().busy && (current=missing()[0])) {
        if(decoder.seeking || Math.abs(decoder.currentTime-current.time)>.00001)await wait('seeked',()=>{decoder.currentTime=current.time;});
        if(s.version!==version)break;
        const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(decoder.videoWidth,decoder.videoHeight));
        canvas.width=Math.round(decoder.videoWidth*scale);canvas.height=Math.round(decoder.videoHeight*scale);
        canvas.getContext('2d').drawImage(decoder,0,0,canvas.width,canvas.height);
        caches[index].set(cacheKey(s,current.time),canvas);
        if(caches[index].size>21)caches[index].delete(caches[index].keys().next().value);
        paintVersion++;paintAll();
      }
    } catch {
      if(s.version===version)for(const entry of missing())failed[index].add(cacheKey(s,entry.time));
      paintVersion++;paintAll();
    } finally {decoder.removeAttribute('src');decoder.load();workers[index]=null;const keep=new Set(keyMomentEntries(s).map(e=>cacheKey(s,e.time)));for(const key of caches[index].keys())if(!keep.has(key))caches[index].delete(key);if(s.ready&&!state().busy)void fillCache(index);}
  }
  function paint(canvas,index,entry) {
    const raw=imageFor(index,entry.time);canvas.hidden=!raw;if(!raw)return false;
    const s=slots[index],mirrored=s.stage.classList.contains('mirrored');
    const stamp=JSON.stringify([entry.time,s.url,s.analysisVersion,paintVersion,mirrored,previewsOverlay,s.review,s.crop,drawingSignature]);
    if(canvas.dataset.paint===stamp)return true;
    const region=cropRegion(s.crop),w=Math.round(raw.width*region.width),h=raw.height;
    canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
    ctx.save();if(mirrored){ctx.translate(w,0);ctx.scale(-1,1);}ctx.translate(-region.x*raw.width,0);ctx.drawImage(raw,0,0);
    if(previewsOverlay)drawReview(ctx,s,entry.time,raw.width,h,{color:index?'#9ecdf2':'#dcf59c',mirrorText:mirrored});
    ctx.restore();paintDrawings(ctx,index,entry.time,w,h,mirrored,region);canvas.dataset.paint=stamp;return true;
  }
  function paintAll() {
    for(const {button,canvas,position,index} of cellViews){
      const entry=keyMomentEntries(slots[index])[position],has=Number.isFinite(entry.time),success=has && paint(canvas,index,entry);
      if(!has)canvas.hidden=true;
      button.querySelector('.key-frame-placeholder').textContent=success?'':has?(failed[index].has(cacheKey(slots[index],entry.time))?'Open frame':'Loading…'):'Not marked';
    }
    if(dialog.open)renderDialog();
  }
  function renderDialog() {
    if(!dialog.open)return;
    const {mode,busy}=state();
    const entries=slots.map(s=>keyMomentEntries(s)[selected]);
    const sampled=entries.some((e,i)=>(i===0||mode==='compare')&&e.source==='sampled');
    dialog.querySelector('h2').textContent=sampled?`Review frame ${selected+1}`:KEY_MOMENTS[selected][1];
    dialog.querySelector('.key-review-note').textContent=sampled?`Phases were unclear. These are range previews. Editing a frame assigns it as ${KEY_MOMENTS[selected][1].toLowerCase()}.`:'Estimates use hand movement, not ball contact. Check the frame and edit it below.';
    dialog.querySelectorAll('nav button').forEach((b,i)=>b.setAttribute('aria-current',i===selected?'true':'false'));
    panels.forEach((panel,index)=>{
      panel.hidden=index===1 && mode!=='compare';const s=slots[index],entry=keyMomentEntries(s)[selected],has=Number.isFinite(entry.time);
      const suffix=mode==='compare'?` swing ${name(index)}`:'';
      panel.querySelector('.key-swing-label').textContent=mode==='compare'?`Swing ${name(index)}`:'Your swing';
      panel.querySelector('.key-frame-back').setAttribute('aria-label',`Previous key frame${suffix}`);
      panel.querySelector('.key-frame-next').setAttribute('aria-label',`Next key frame${suffix}`);
      panel.querySelector('input').setAttribute('aria-label',`Key moment frame${suffix?` in${suffix}`:''}`);
      panel.style.setProperty('--moment-color',entry.source==='sampled'?'#667466':MOMENT_COLORS[entry.key]);
      panel.querySelector('.key-source').textContent=sourceLabel(entry.source);
      const success=has && paint(panel.querySelector('canvas'),index,entry);
      if(!has)panel.querySelector('canvas').hidden=true;
      panel.querySelector('.key-large-frame p').textContent=success?'':has?(failed[index].has(cacheKey(s,entry.time))?'Preview unavailable. Open this frame in the player.':'Loading frame…'):`Analyze${suffix} or set this moment from the player.`;
      panel.querySelector('.key-detail-time').textContent=has?`${entry.label} · ${frameStamp(entry.time,s)}`:'Choose a frame';
      const values=has?measurements(nearestSample(s.samples,entry.time,s.tolerance)?.points,s.video.videoWidth,s.video.videoHeight,s.hand):{};
      panel.querySelector('.key-posture-notes').textContent=postureNotes(s,entry.time).join(' ');
      panel.querySelector('.key-detail-metrics').textContent=[['elbow','Elbow'],['knee','Knee'],['lean','Torso']].map(([k,l])=>`${l} ${Number.isFinite(values[k])?`${Math.round(values[k])}°`:'—'}`).join(' · ');
      const input=panel.querySelector('input');if(document.activeElement!==input)input.value=has?frameNumber(entry.time,s.fps):'';input.max=lastFrame(s.video.duration,s.fps);input.disabled=!s.ready||busy;
      panel.querySelectorAll('button').forEach(b=>b.disabled=!s.ready||busy||(!has&&!b.classList.contains('key-set-current')));
    });
  }
  function render(drawings='') {
    lastDrawings=drawings;drawingSignature=drawings+document.getElementById('drawingVisibility').getAttribute('aria-pressed');const {mode,busy}=state();
    const data=slots.map(s=>keyMomentEntries(s)),available=slots.some((s,i)=>(i===0||mode==='compare')&&s.ready);
    strip.hidden=!available;document.getElementById('studio').classList.toggle('has-key-moments',available);document.getElementById('studio').classList.toggle('key-portrait',slots[0].video.videoHeight>slots[0].video.videoWidth);
    const mobile=matchMedia('(max-width: 900px)').matches;
    const parent=mobile?document.getElementById('studio'):document.querySelector('.video-editor');
    if(strip.parentElement!==parent)parent.append(strip);
    const next=JSON.stringify([mode,busy,slots.map((s,i)=>[s.ready,s.url,s.fps,s.shotFps,s.crop,s.analysisVersion,s.card.classList.contains('selected'),data[i]])]);
    if(signature!==next){
      signature=next;strip.querySelector('.key-enlarge').disabled=busy;
      strip.querySelectorAll('[data-edit-slot]').forEach((b,i)=>{b.hidden=i===1&&mode!=='compare';b.disabled=busy||!slots[i].ready;b.textContent=mode==='compare'?`Edit ${name(i)}`:'Edit frames';});
      const fallback=data.some((list,i)=>(i===0||mode==='compare')&&list.some(e=>e.source==='sampled'));
      const detected=data.some((list,i)=>(i===0||mode==='compare')&&list.some(e=>e.source==='estimated'));
      strip.classList.toggle('has-previews',data.some((list,i)=>(i===0||mode==='compare')&&list.some(e=>Number.isFinite(e.time))));
      strip.querySelector('.key-strip-note').textContent=fallback?'Swing phases are uncertain · Set each moment from the player.':detected?'Auto estimates · Your edits take priority. Verify impact.':'Analyze to find all seven moments automatically, or pause and use Set here.';
      cards.forEach(({card,title},p)=>{
        const entries=data.map(a=>a[p]).filter((e,i)=>i===0||mode==='compare');
        const allSampled=entries.some(e=>Number.isFinite(e.time)) && entries.filter(e=>Number.isFinite(e.time)).every(e=>e.source==='sampled');
        card.style.setProperty('--moment-color',allSampled?'#667466':MOMENT_COLORS[KEY_MOMENTS[p][0]]);
        title.textContent=allSampled?`Preview ${p+1} ↗`:`${p+1} ${KEY_MOMENTS[p][0]==='follow'?'Follow':MOMENT_NAMES[KEY_MOMENTS[p][0]]} ↗`;title.disabled=busy;
        card.classList.toggle('paired',mode==='compare');
        const sync=card.querySelector('.key-sync');sync.hidden=mode!=='compare';sync.disabled=busy||entries.length<2||entries.some(e=>!Number.isFinite(e.time)||e.source==='sampled');
      });
      cellViews.forEach(({button,position,index})=>{
        const entry=data[index][position],has=Number.isFinite(entry.time);
        const cell=button.parentElement;cell.hidden=index===1&&mode!=='compare';cell.classList.toggle('is-active',slots[index].card.classList.contains('selected'));cell.dataset.source=entry.source;cell.dataset.empty=!has;cell.querySelector('.moment-mark').disabled=!slots[index].ready||busy;
        const suffix=mode==='compare'?` in swing ${name(index)}`:'';
        const mark=cell.querySelector('.moment-mark'),markLabel=mode==='compare'?`Set ${name(index)}`:'Set here';mark.textContent=markLabel;
        mark.setAttribute('aria-label',`Set ${KEY_MOMENTS[position][1]} here${suffix}`);
        mark.title=`Replace ${KEY_MOMENTS[position][1]} with the frame currently displayed${suffix}`;
        if(entry.source==='sampled'&&mode==='single')mark.textContent=`Set ${entry.key==='follow'?'Follow':MOMENT_NAMES[entry.key]}`;
        if(entry.source==='sampled'&&mode==='compare')mark.innerHTML=`${markLabel}<span class="moment-assignment">${entry.key==='follow'?'Follow':MOMENT_NAMES[entry.key]}</span>`;
        const note=cell.querySelector('.key-frame-note');note.hidden=!notesVisible||!has||entry.source==='sampled';note.textContent=has?postureNotes(slots[index],entry.time)[0]:'';
        button.hidden=false;button.disabled=!has||busy;
        button.querySelector('.key-slot-badge').textContent=mode==='compare'?`${name(index)} · ${{marked:'Marked',estimated:'Auto',sampled:'Preview',empty:'Unset'}[entry.source]}`:sourceLabel(entry.source);
        button.title=has?`${entry.label} · ${sourceLabel(entry.source)} · ${frameStamp(entry.time,slots[index])}`:`Pause at ${KEY_MOMENTS[position][1]} and set it from the player`;
        const stamp=button.querySelector('.key-frame-time');
        stamp.textContent=has?frameStamp(entry.time,slots[index]):`${mode==='compare'?`${name(index)} · `:''}Not set`;
        if(mode==='compare'&&has){const [time,frame]=frameStamp(entry.time,slots[index]).split(' · ');stamp.innerHTML=`<span>${time}</span> <span>${frame}</span>`;}
        button.setAttribute('aria-label',has?`Jump to ${entry.label}${suffix}, ${frameStamp(entry.time,slots[index])}`:`No ${KEY_MOMENTS[position][1]}${suffix}`);
      });
      slots.forEach((s,i)=>{if(!s.ready){caches[i].clear();failed[i].clear();}});
    }
    const current=slots.map(s=>currentMoment(s)?.key);
    cellViews.forEach(({button,position,index})=>button.setAttribute('aria-current',current[index]===KEY_MOMENTS[position][0]));
    const visual=JSON.stringify([next,drawingSignature,slots.map(s=>[s.analysisVersion,s.hand,s.crop,s.review,s.stage.classList.contains('mirrored')]),previewsOverlay,notesVisible,mobile]);
    if(visual===lastVisual)return;lastVisual=visual;
    if(available){paintAll();slots.forEach((s,i)=>{if(i===0||mode==='compare')void fillCache(i);});}
  }
  return {render};
}
