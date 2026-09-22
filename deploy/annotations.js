import { DrawingHistory, clone, isDrawingVisible, toVideoPoint, hitShape, movePoints, paintShape, angleDegrees, scaleShape } from './drawing.js';
import { frameStamp } from './timing.js';

const tools = [
  ['view','View','<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
  ['select','Select','<path d="m5 3 14 11-8 1-4 7z"/>'],
  ['pen','Pen','<path d="m4 17-1 4 4-1L21 6l-4-4zM14 5l5 5"/>'],
  ['line','Line','<path d="m4 20 16-16"/><circle cx="4" cy="20" r="1"/><circle cx="20" cy="4" r="1"/>'],
  ['arrow','Arrow','<path d="m4 20 16-16M9 4h11v11"/>'],
  ['circle','Circle','<ellipse cx="12" cy="12" rx="9" ry="7"/>'],
  ['rect','Box','<rect x="3" y="5" width="18" height="14" rx="1"/>'],
  ['label','Label','<path d="M4 5h16M12 5v15M8 20h8"/>'],
  ['angle','Angle','<path d="M5 3v17h16M5 14a6 6 0 0 1 6 6M5 11l13-8"/>'],
];
const palette = [['#dcf59c','Lime'],['#ffca62','Gold'],['#ff7995','Pink'],['#7edbff','Blue'],['#ffffff','White']];
export function createAnnotations({ slots, state, selectSlot, pauseAll, pauseControlled, seekActive, toast, changed }) {
  const $ = id => document.getElementById(id);
  const histories = slots.map(() => new DrawingHistory());
  let tool='view', color=palette[0][0], width=3, scope='clip', visible=true, selection=null, draft=null, gesture=null;
  const toolbar = $('studio');
  $('drawingToolbar').innerHTML = `
    <h3 class="drawing-rail-title">Draw</h3>
    <div class="drawing-tools" role="group" aria-label="Drawing tools">${tools.map(([key,label,path])=>`<button data-tool="${key}" aria-pressed="${key==='view'}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span>${label}</span></button>`).join('')}</div>
    <div class="drawing-history"><button id="drawingUndo" title="Undo (⌘/Ctrl Z)"><span aria-hidden="true">↶</span> Undo</button><button id="drawingRedo" title="Redo (⌘/Ctrl Shift Z)"><span aria-hidden="true">↷</span> Redo</button></div>`;
  $('drawingSettings').innerHTML = `
    <div class="drawing-context"><div class="drawing-target" aria-label="Drawing target"><span>Editing</span><button data-drawing-slot="0" aria-pressed="true">Swing A</button><button data-drawing-slot="1" aria-pressed="false" hidden>Swing B</button></div>
    <div class="drawing-settings"><div class="drawing-colors" role="group" aria-label="Drawing color">${palette.map(([hex,name])=>`<button data-color="${hex}" aria-label="${name} drawing color" aria-pressed="${hex===color}" style="--swatch:${hex}"><span></span></button>`).join('')}</div><label>Stroke <select id="drawingWidth"><option value="1">1 px</option><option value="2">Thin</option><option value="3" selected>Medium</option><option value="4">4 px</option><option value="5">Bold</option><option value="6">6 px</option><option value="7">7 px</option><option value="8">8 px</option></select></label><label>Show on <select id="drawingScope"><option value="clip">Entire clip</option><option value="frame">This frame</option></select></label></div></div>
    <p id="drawingHint" class="drawing-instruction" role="status"></p>`;
  $('drawingActions').innerHTML = `
    <div class="drawing-actions"><div><button id="drawingVisibility" aria-pressed="true">Hide drawings</button><button id="drawingDelete">Delete selected</button><button id="drawingClear">Clear clip</button></div><div><button id="drawingCopy" hidden>Copy to B</button><button id="drawingSnapshot" class="snapshot-button">↓ Save image</button></div></div>
    <div class="drawing-footer"><span id="drawingCount">0 drawings</span><div id="drawingFrames" class="drawing-frames" aria-label="Annotated frames"></div></div>`;
  slots.forEach((slot,i)=>{
    const canvas=document.createElement('canvas'); canvas.className='annotation-canvas'; canvas.hidden=true;
    canvas.setAttribute('aria-label',`Drawing surface for swing ${i?'B':'A'}`);
    slot.plane.append(canvas); slot.annotationCanvas=canvas;
    canvas.addEventListener('pointerdown',e=>pointerDown(e,i));
    canvas.addEventListener('pointermove',e=>pointerMove(e,i));
    canvas.addEventListener('pointerup',e=>pointerUp(e,i));
    canvas.addEventListener('pointercancel',cancelDraft);
    canvas.addEventListener('lostpointercapture',()=>{ if(gesture) cancelDraft(); });
    // An unfinished drawing must never move to a different frame or clip.
    slot.video.addEventListener('seeking',()=>{ if(draft?.slot===i || gesture?.slot===i) cancelDraft(); });
    slot.video.addEventListener('play',()=>{ if(tool!=='view') setTool('view'); });
  });
  const current=()=>histories[state().active];
  const displayed=i=>visible ? histories[i].items.filter(shape=>isDrawingVisible(shape,slots[i].video.currentTime)) : [];
  const mirrored=i=>slots[i].stage.classList.contains('mirrored');
  function invalidateSelection() {
    if(selection && (selection.slot!==state().active || !displayed(selection.slot).some(s=>s.id===selection.id))) selection=null;
  }
  function selectedShape() { return selection && histories[selection.slot].items.find(s=>s.id===selection.id); }
  let pendingLabelCopy=null;
  function copyNew(i,items){histories[1-i].commit([...histories[1-i].items,...items.map(s=>({...clone(s),id:crypto.randomUUID(),time:slots[1-i].video.currentTime,frameDuration:1/slots[1-i].fps}))]);}
  function commit(i,items,copy=true) {
    if(copy&&$('drawingLink').checked&&state().mode==='compare'&&slots[1-i].ready){
      const added=items.filter(item=>item.tool!=='label'&&!histories[i].items.some(old=>old.id===item.id));
      if(added.length)copyNew(i,added);
    }
    histories[i].commit(items); changed(); render();
  }
  function cancelDraft() { draft=null; gesture=null; render(); }
  function setTool(next) {
    draft=null; gesture=null; tool=next;
    if(next!=='view') { pauseControlled(); visible=true; }
    if(next!=='select') selection=null;
    render();
  }
  function newShape(i,points) { return {id:crypto.randomUUID(),tool,color,width,scope,time:slots[i].video.currentTime,frameDuration:1/slots[i].fps,points}; }
  function point(e,i) { return toVideoPoint(e.clientX,e.clientY,slots[i].annotationCanvas.getBoundingClientRect(),mirrored(i)); }
  function pointerDown(e,i) {
    if(e.button!==0 || !e.isPrimary || state().busy || !slots[i].ready || tool==='view' || !visible) return;
    e.preventDefault();
    if(gesture) return;
    if(draft && draft.slot!==i) draft=null;
    pauseControlled(i); selectSlot(i); invalidateSelection();
    const p=point(e,i), canvas=slots[i].annotationCanvas, rect=canvas.getBoundingClientRect();
    if(tool==='label') {
      const shape={...newShape(i,[p]),label:'Note'};commit(i,[...histories[i].items,shape]);selection={slot:i,id:shape.id};pendingLabelCopy=$('drawingLink').checked&&state().mode==='compare'&&slots[1-i].ready?{slot:i,id:shape.id}:null;setTool('select');openEditor();return;
    }
    if(tool==='angle') {
      if(!draft) draft={slot:i,shape:newShape(i,[p])};
      else {
        const previous=draft.shape.points.at(-1);
        if(Math.hypot((p.x-previous.x)*rect.width,(p.y-previous.y)*rect.height)<5) return;
        draft.shape.points.push(p);
        if(draft.shape.points.length===3) { const shape=draft.shape; draft=null; commit(i,[...histories[i].items,shape]); }
      }
      render(); return;
    }
    if(tool==='select') {
      const selected=selection?.slot===i ? selectedShape() : null;
      const handle=selected && !selected.rotation && !['pen','label'].includes(selected.tool) ? selected.points.findIndex(q=>Math.hypot((p.x-q.x)*rect.width,(p.y-q.y)*rect.height)<14) : -1;
      const shape=handle>=0 ? selected : [...displayed(i)].reverse().find(s=>hitShape(s,p,rect.width,rect.height,e.pointerType==='touch'?20:12,mirrored(i)));
      selection=shape ? {slot:i,id:shape.id} : null;
      if(shape) gesture={slot:i,original:clone(shape),shape:clone(shape),start:p,handle,pointer:e.pointerId};
    } else { draft={slot:i,shape:newShape(i,[p,p])}; gesture={slot:i,start:p,pointer:e.pointerId}; }
    if(gesture) canvas.setPointerCapture(e.pointerId);
    render();
  }
  function pointerMove(e,i) {
    if(!gesture || gesture.slot!==i || gesture.pointer!==e.pointerId) return;
    e.preventDefault(); const p=point(e,i);
    if(tool==='select') {
      if(gesture.handle>=0) gesture.shape.points[gesture.handle]=p;
      else gesture.shape.points=movePoints(gesture.original.points,p.x-gesture.start.x,p.y-gesture.start.y);
    } else if(draft) {
      if(tool==='pen') {
        const last=draft.shape.points.at(-1), rect=slots[i].annotationCanvas.getBoundingClientRect();
        if(Math.hypot((p.x-last.x)*rect.width,(p.y-last.y)*rect.height)>1.5 && draft.shape.points.length<2500) draft.shape.points.push(p);
      } else draft.shape.points[1]=p;
    }
    render();
  }
  function pointerUp(e,i) {
    if(!gesture || gesture.slot!==i || gesture.pointer!==e.pointerId) return;
    pointerMove(e,i);
    const editing=gesture.shape, pending=draft?.shape, original=gesture.original;
    gesture=null; draft=null;
    if(slots[i].annotationCanvas.hasPointerCapture(e.pointerId)) slots[i].annotationCanvas.releasePointerCapture(e.pointerId);
    if(editing) { if(JSON.stringify(editing)!==JSON.stringify(original)) commit(i,histories[i].items.map(s=>s.id===editing.id?editing:s)); }
    else if(pending) {
      const rect=slots[i].annotationCanvas.getBoundingClientRect(), xs=pending.points.map(p=>p.x), ys=pending.points.map(p=>p.y);
      const dx=(Math.max(...xs)-Math.min(...xs))*rect.width,dy=(Math.max(...ys)-Math.min(...ys))*rect.height;
      if(Math.hypot(dx,dy)>4 && (pending.tool!=='circle' || (dx>4 && dy>4))) commit(i,[...histories[i].items,pending]);
    }
    render();
  }
  function setStyle(key,value) {
    if(key==='color') color=value; if(key==='width') width=value; if(key==='scope') scope=value;
    const shape=selectedShape();
    if(shape) commit(selection.slot,histories[selection.slot].items.map(s=>s.id===shape.id ? {...s,[key]:value,time:slots[selection.slot].video.currentTime,frameDuration:1/slots[selection.slot].fps} : s));
    render();
  }
  function historyAction(action) { if(state().busy) return; draft=null; gesture=null; selection=null; current()[action](); changed(); render(); }
  toolbar.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  toolbar.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>setStyle('color',b.dataset.color));
  toolbar.querySelectorAll('[data-drawing-slot]').forEach(b=>b.onclick=()=>{ cancelDraft(); selection=null; selectSlot(Number(b.dataset.drawingSlot)); render(); });
  $('drawingWidth').onchange=e=>setStyle('width',Number(e.target.value));
  $('drawingScope').onchange=e=>setStyle('scope',e.target.value);
  $('drawingVisibility').onclick=()=>{ visible=!visible; draft=null; gesture=null; selection=null; render(); changed(); };
  $('drawingUndo').onclick=()=>historyAction('undo'); $('drawingRedo').onclick=()=>historyAction('redo');
  $('drawingDelete').onclick=()=>{ if(selection){ const {slot,id}=selection; selection=null; commit(slot,histories[slot].items.filter(s=>s.id!==id)); } };
  $('drawingClear').onclick=()=>{ draft=null; selection=null; gesture=null; commit(state().active,[]); toast('Drawings cleared from this clip. Undo brings them back.'); };
  $('drawingCopy').onclick=()=>{
    const from=state().active,to=1-from,shape=selectedShape(),items=shape?[shape]:displayed(from);
    if(!items.length || !slots[to].ready) return;
    const copied=items.map(s=>({...clone(s),id:crypto.randomUUID(),time:slots[to].video.currentTime,frameDuration:1/slots[to].fps}));
    commit(to,[...histories[to].items,...copied],false);
    toast(`Copied ${items.length===1?'drawing':'visible drawings'} to swing ${to?'B':'A'}. Use Select to adjust for its camera view.`);
  };
  $('drawingSnapshot').onclick=saveImage;
  const custom=document.createElement('input');custom.type='color';custom.id='drawingCustomColor';custom.value=color;custom.setAttribute('aria-label','Custom drawing color');custom.title='Custom color';custom.oninput=e=>setStyle('color',e.target.value);toolbar.querySelector('.drawing-colors').append(custom);
  const link=document.createElement('label');link.className='drawing-link';link.innerHTML='<input id="drawingLink" type="checkbox">Copy new drawings to other video';$('drawingActions').querySelector('.drawing-actions').append(link);
  const editButtons=slots.map((slot)=>{const b=document.createElement('button');b.className='drawing-edit-float';b.textContent='Edit drawing';b.hidden=true;b.onclick=openEditor;slot.stage.append(b);return b;});
  const editor=document.createElement('dialog');editor.id='drawingEditor';editor.className='drawing-editor';editor.setAttribute('aria-labelledby','drawingEditorTitle');editor.innerHTML='<form method="dialog"><header><h2 id="drawingEditorTitle">Edit drawing</h2><button aria-label="Close drawing editor">×</button></header><label class="drawing-label-field">Label <input id="drawingLabel" maxlength="48" autocomplete="off"></label><div class="drawing-transform"><button type="button" data-rotate="-15">↶ 15°</button><button type="button" data-rotate="15">↷ 15°</button><button type="button" data-scale="0.85">Smaller</button><button type="button" data-scale="1.15">Larger</button></div><p>Rotate or resize this drawing. Undo remains available beside the video.</p><button>Done</button></form>';document.body.append(editor);
  editor.addEventListener('close',()=>{if(pendingLabelCopy){const {slot,id}=pendingLabelCopy,shape=histories[slot].items.find(s=>s.id===id);pendingLabelCopy=null;if(shape&&slots[1-slot].ready){copyNew(slot,[shape]);changed();render();}}});
  function openEditor(){
    const shape=selectedShape();if(!shape)return;
    editor.querySelector('.drawing-label-field').hidden=shape.tool!=='label';$('drawingLabel').value=shape.label||'';
    editor.showModal();const b=editButtons[selection.slot].getBoundingClientRect();editor.style.left=`${Math.max(8,Math.min(b.left,innerWidth-editor.offsetWidth-8))}px`;editor.style.top=`${Math.max(8,Math.min(b.bottom+5,innerHeight-editor.offsetHeight-8))}px`;
    if(shape.tool==='label'){$('drawingLabel').focus();$('drawingLabel').select();}
  }
  function editSelected(transform){const shape=selectedShape();if(shape)commit(selection.slot,histories[selection.slot].items.map(s=>s.id===shape.id?transform(s):s));}
  $('drawingLabel').oninput=e=>{const value=e.target.value;editSelected(s=>({...s,label:value||'Note'}));};
  editor.querySelectorAll('[data-rotate]').forEach(b=>b.onclick=()=>editSelected(s=>({...s,rotation:((s.rotation||0)+Number(b.dataset.rotate))%360})));
  editor.querySelectorAll('[data-scale]').forEach(b=>b.onclick=()=>editSelected(s=>scaleShape(s,Number(b.dataset.scale))));
  document.addEventListener('keydown',e=>{
    if(state().busy || document.querySelector('dialog[open]') || e.target.closest('input,select,textarea,[contenteditable]')) return;
    if(e.key==='Escape') { if(draft || gesture) cancelDraft(); else setTool('view'); }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='z') { e.preventDefault(); historyAction(e.shiftKey?'redo':'undo'); }
    if((e.key==='Delete' || e.key==='Backspace') && selection) { e.preventDefault(); $('drawingDelete').click(); }
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const shortcut={v:'select',m:'label',f:'pen',l:'line',a:'arrow',c:'circle',r:'rect',d:tool==='view'?'pen':'view'}[e.key.toLowerCase()];if(shortcut){e.preventDefault();setTool(shortcut);}}
  });
  function render() {
    const {active,mode,busy}=state(); invalidateSelection();
    toolbar.dataset.activeTool = tool;
    if(busy && (draft || gesture)) {draft=null;gesture=null;}
    const s=slots[active], history=current(), selected=selectedShape();
    link.hidden=mode!=='compare';$('drawingLink').disabled=busy||!slots.every(s=>s.ready);custom.disabled=busy||!s.ready;custom.value=selected?.color||color;
    editButtons.forEach((button,i)=>{button.hidden=!selected||selection.slot!==i||tool!=='select'||busy;
      if(!button.hidden){const box=slots[i].annotationCanvas.getBoundingClientRect(),stage=slots[i].stage.getBoundingClientRect(),point=selected.points[0];
        button.style.left=`${Math.max(4,Math.min(box.left-stage.left+(mirrored(i)?1-point.x:point.x)*box.width,stage.width-110))}px`;button.style.top=`${Math.max(4,Math.min(box.top-stage.top+point.y*box.height+12,stage.height-36))}px`;}
    });
    slots.forEach((slot,i)=>{
      slot.viewport.apply();
      const canvas=slot.annotationCanvas; canvas.hidden=!slot.ready;
      canvas.setAttribute('aria-label',mode==='compare'?`Drawing surface for swing ${i?'B':'A'}`:'Drawing surface');
      canvas.classList.toggle('drawing-active',!busy && visible && tool!=='view');
      canvas.classList.toggle('select-tool',tool==='select');
      if(!slot.ready || (mode==='single' && i===1)) return;
      const {width:w,height:h}=slot.viewport.geometry().image,dpr=window.devicePixelRatio||1;
      canvas.style.width=`${w}px`; canvas.style.height=`${h}px`;
      if(canvas.width!==Math.round(w*dpr) || canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
      for(const shape of displayed(i)) paintShape(ctx,gesture?.shape?.id===shape.id?gesture.shape:shape,w,h,mirrored(i),!busy && tool==='select' && selection?.id===shape.id);
      if(draft?.slot===i) paintShape(ctx,draft.shape,w,h,mirrored(i),true);
      canvas.dataset.visibleDrawings=String(displayed(i).length);
    });
    toolbar.querySelectorAll('[data-tool]').forEach(b=>{b.disabled=busy||!s.ready;b.setAttribute('aria-pressed',b.dataset.tool===tool);});
    toolbar.querySelectorAll('[data-drawing-slot]').forEach(b=>{const i=Number(b.dataset.drawingSlot); b.hidden=i===1&&mode!=='compare'; b.disabled=busy;b.setAttribute('aria-pressed',i===active);});
    toolbar.querySelectorAll('[data-color]').forEach(b=>{b.disabled=busy||!s.ready; b.setAttribute('aria-pressed',b.dataset.color===(selected?.color||color));});
    $('drawingWidth').value=selected?.width||width; $('drawingScope').value=selected?.scope||scope;
    for(const id of ['drawingWidth','drawingScope','drawingVisibility','drawingSnapshot']) $(id).disabled=busy||!s.ready;
    $('drawingVisibility').textContent=visible?'Hide drawings':'Show drawings'; $('drawingVisibility').setAttribute('aria-pressed',visible);
    $('drawingUndo').disabled=busy||!history.past.length; $('drawingRedo').disabled=busy||!history.future.length;
    $('drawingDelete').disabled=busy||!selected; $('drawingClear').disabled=busy||!history.items.length;
    $('drawingCopy').hidden=mode!=='compare'; $('drawingCopy').textContent=`Copy ${selected?'selected':'visible'} to ${active?'A':'B'}`;
    $('drawingCopy').disabled=busy||!slots[1-active].ready||!displayed(active).length;
    $('drawingSnapshot').textContent=mode==='compare'?'↓ Save comparison':'↓ Save image';
    $('drawingCount').textContent=`${history.items.length} drawing${history.items.length===1?'':'s'}${mode==='compare'?` on ${active?'B':'A'}`:''}`;
    const hints={view:'Choose a tool to draw. Zoom stays while playing.',select:'Drag to move. Edit drawing changes text, rotation and size.',pen:'Drag to trace a path.',line:'Drag to draw a reference line.',arrow:'Drag from the tail to the arrow tip.',circle:'Drag around the area to highlight.',rect:'Drag a box around the area to highlight.',label:'Tap the video to add a label.',angle:draft?'Tap '+(draft.shape.points.length===1?'the joint, then the other endpoint.':'the last endpoint to finish.'):'Angle: tap the first endpoint, joint, then other endpoint.'};
    const hint=!s.ready?'Add a video, then choose a drawing tool. No analysis needed.':busy?'Drawing is paused while analysis runs.':!visible?'Drawings are hidden. Show them again to edit.':hints[tool];
    $('drawingHint').title=hint;
    if($('drawingHint').textContent!==hint) $('drawingHint').textContent=hint;
    const times=[...new Set(history.items.filter(s=>s.scope==='frame').map(s=>s.time))].sort((a,b)=>a-b);
    const frames=$('drawingFrames'), signature=`${active}:${busy}:${s.fps}:${s.shotFps}:${times.join(',')}`;
    if(frames.dataset.signature!==signature){
      frames.dataset.signature=signature; frames.replaceChildren();
      if(times.length){
        const select=document.createElement('select');select.setAttribute('aria-label','Go to an annotated frame');select.disabled=busy;
        select.add(new Option('Choose a frame',''));
        times.forEach(time=>select.add(new Option(frameStamp(time,s),String(time))));
        select.onchange=()=>{if(select.value!==''){cancelDraft();seekActive(Number(select.value));select.value='';}};
        frames.append(select);
      }
    }
  }
  async function saveImage() {
    const {mode,active,busy}=state(); if(busy) return;
    pauseAll(); cancelDraft();
    const indices=(mode==='compare'?[0,1]:[active]).filter(i=>slots[i].ready);
    if(!indices.length) return;
    $('drawingSnapshot').disabled=true;
    try {
      // Wait for seek completion before combining a frame with its overlays.
      await Promise.all(indices.map(i=>new Promise((resolve,reject)=>{
        const video=slots[i].video; if(!video.seeking && video.readyState>=2) return resolve();
        const finish=()=>{clearTimeout(timer);video.removeEventListener('seeked',finish);resolve();};
        const timer=setTimeout(()=>{video.removeEventListener('seeked',finish);reject(new Error('Frame is still loading. Try again.'));},5000);
        video.addEventListener('seeked',finish,{once:true});
      })));
      const cellWidth=720, imageHeight=720, header=65, footer=40, gap=16;
      const canvas=document.createElement('canvas');canvas.width=indices.length*cellWidth+(indices.length-1)*gap;canvas.height=header+imageHeight+footer;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#17251f';ctx.fillRect(0,0,canvas.width,canvas.height);
      indices.forEach((i,column)=>{
        const s=slots[i],left=column*(cellWidth+gap);
        const view=s.viewport.geometry(),w=view.image.width,h=view.image.height;
        ctx.fillStyle='#d6ee9c';ctx.font='600 22px sans-serif';ctx.fillText(`${mode==='compare'?`Swing ${i?'B':'A'}`:'Your swing'}  ·  ${frameStamp(s.video.currentTime,s)}  ·  ${view.zoom.toFixed(2)}×`,left+22,40);
        // Export the same cropped viewport the user is inspecting. Clip before
        // scaling so enlarged video and drawings cannot cover the other panel.
        const scale=Math.min(cellWidth/view.stage.width,imageHeight/view.stage.height);
        const sw=view.stage.width*scale,sh=view.stage.height*scale;
        const x=left+(cellWidth-sw)/2,y=header+(imageHeight-sh)/2;
        ctx.save();ctx.beginPath();ctx.rect(x,y,sw,sh);ctx.clip();
        ctx.translate(x+sw/2+view.offset.x*scale,y+sh/2+view.offset.y*scale);
        ctx.scale(scale*view.zoom,scale*view.zoom);ctx.translate(-w/2,-h/2);
        ctx.beginPath();ctx.rect(view.crop.x*w,0,view.crop.width*w,h);ctx.clip();
        ctx.save();if(mirrored(i)){ctx.translate(w,0);ctx.scale(-1,1);}
        ctx.drawImage(s.video,0,0,w,h);ctx.drawImage(s.canvas,0,0,w,h);ctx.restore();
        for(const shape of displayed(i)) paintShape(ctx,shape,w,h,mirrored(i));
        ctx.restore();
      });
      ctx.fillStyle='#b7c5b5';ctx.font='16px sans-serif';ctx.fillText('FreeGolfSwingAnalyzer.com',22,canvas.height-15);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Could not create an image. Please try again.');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=indices.length===2?'swing-comparison.png':'swing-annotated-frame.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast('Saved the current frame with its visible drawings.');
    } catch(error){toast(error.message);} finally{render();}
  }
  return {
    render,
    paintFrame(ctx,i,time,w,h,mirror,region={x:0,width:1}) {
      if(visible)for(const shape of histories[i].items.filter(shape=>isDrawingVisible(shape,time)))paintShape(ctx,{...shape,points:shape.points.map(p=>({...p,x:(p.x-region.x)/region.width}))},w,h,mirror);
    },
    capture(i,maxSize=2000) {
      const s=slots[i],view=s.viewport.geometry(),w=view.image.width,h=view.image.height;
      // Retain exactly the visible zoom/crop/pan, but remove the stage's empty
      // letterboxing before scaling for a full-page print. Never stretch video.
      const left=view.stage.width/2+view.offset.x+(view.crop.x-.5)*w*view.zoom;
      const top=view.stage.height/2+view.offset.y-h*view.zoom/2;
      const x=Math.max(0,left),y=Math.max(0,top);
      const sw=Math.max(1,Math.min(view.stage.width,left+view.crop.width*w*view.zoom)-x);
      const sh=Math.max(1,Math.min(view.stage.height,top+h*view.zoom)-y);
      const scale=maxSize/Math.max(sw,sh),width=Math.round(sw*scale),height=Math.round(sh*scale);
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#17251f';ctx.fillRect(0,0,width,height);
      ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
      ctx.translate((view.stage.width/2+view.offset.x-x)*scale,(view.stage.height/2+view.offset.y-y)*scale);
      ctx.scale(scale*view.zoom,scale*view.zoom);ctx.translate(-w/2,-h/2);
      ctx.beginPath();ctx.rect(view.crop.x*w,0,view.crop.width*w,h);ctx.clip();
      ctx.save();if(mirrored(i)){ctx.translate(w,0);ctx.scale(-1,1);}
      ctx.drawImage(s.video,0,0,w,h);ctx.drawImage(s.canvas,0,0,w,h);ctx.restore();
      for(const shape of displayed(i)) paintShape(ctx,shape,w,h,mirrored(i));
      ctx.restore();return canvas;
    },
    isViewing: () => tool === 'view' || !visible,
    view: () => setTool('view'),
    reset(i){histories[i].reset();if(selection?.slot===i)selection=null;draft=null;gesture=null;render();},
    interrupt(){draft=null;gesture=null;selection=null;},
    data(i){return histories[i].items.map(s=>({...clone(s),angle:s.tool==='angle'?angleDegrees(s.points,slots[i].video.videoWidth,slots[i].video.videoHeight):undefined}));},
    count(i){return histories[i].items.length;},
  };
}
