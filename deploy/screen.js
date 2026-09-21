// Keep controls in one viewport. Panels reuse the original controls and handlers;
// no media is reloaded when switching panels or changing the window size.
export function createStudioScreen({ slots, state, changed }) {
  const $ = id => document.getElementById(id);
  const studio = $('studio'), inspector = $('analysisPanel');
  const compact = matchMedia('(max-width: 1000px)');
  let current = 'range', collapsed = true, scheduled = false;
  const definitions = [['draw','Draw'],['video','Video'],['range','Range'],['pose','Results'],['moments','Moments']];
  const original = selector => inspector.querySelector(selector);
  const pieces = {
    hand: original('.setting-row'), summary: original('.analysis-range-summary'),
    overlays: original('.overlay-options'), metrics: $('metrics'), note: original('.metric-note'),
    momentsHeading: original('.phase-heading'), momentsCopy: original('.panel-copy.compact'),
    clearMarks: $('clearMarks'), phases: $('phases'), tempo: original('.tempo'), tempoNote: $('tempoNote'), export: $('export'),
  };
  const heading = studio.querySelector('.studio-heading');
  heading.append($('analysisTarget'));
  const tabs = document.createElement('nav'); tabs.className = 'screen-tabs'; tabs.setAttribute('aria-label','Workspace controls'); tabs.setAttribute('role','tablist');
  tabs.innerHTML = definitions.map(([id,label])=>`<button id="tab-${id}" data-panel="${id}" role="tab" aria-controls="panel-${id}" aria-selected="false">${label}</button>`).join('');
  heading.append(tabs);
  const help = document.createElement('button');
  help.id = 'workspaceHelp'; help.className = 'workspace-help'; help.textContent = 'Help';
  help.setAttribute('aria-haspopup','dialog'); heading.append(help);
  const alignmentHelp = document.createElement('p'); alignmentHelp.id = 'alignmentHelp'; alignmentHelp.hidden = true;
  alignmentHelp.textContent = 'Find impact in each video, then choose Align frames.';
  alignmentHelp.setAttribute('role', 'status');
  const footer = studio.querySelector('.transport'); footer.classList.add('screen-transport');
  studio.append(footer);
  const commands = document.createElement('div'); commands.className = 'screen-commands';
  const context = document.createElement('button'); context.id = 'reviewContext'; context.className = 'review-context';
  context.title = 'Change the analysis range'; context.onclick = () => open('range');
  commands.append(context, $('analyze'), $('cancel')); footer.querySelector('.transport-row').append(commands);
  const notice = document.createElement('div'); notice.className = 'screen-notice';
  notice.append(alignmentHelp, $('status'), $('drawingHint'), $('progress')); footer.append(notice);
  const resultsAction = document.createElement('button'); resultsAction.id = 'viewResults'; resultsAction.textContent = 'View results'; resultsAction.hidden = true;
  resultsAction.onclick = () => { open('pose'); panels.pose.focus({preventScroll:true}); };
  notice.append(resultsAction);
  const panels = Object.fromEntries(definitions.map(([id,label])=>{
    const section=document.createElement('section');section.id=`panel-${id}`;section.className='screen-panel';
    section.tabIndex = 0; section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',`tab-${id}`);
    return [id, section];
  }));
  panels.draw.append($('drawingSettings'), $('drawingActions'));
  panels.range.append($('rangeSelection'), pieces.summary);
  pieces.note.textContent='2D estimates at the playhead. Camera angle and visibility affect accuracy.';
  const resultsEmpty = document.createElement('p'); resultsEmpty.id = 'resultsEmpty'; resultsEmpty.className = 'screen-panel-help';
  resultsEmpty.textContent = 'No analysis yet. Choose a section in Range and select Analyze. You can play and draw without analysis.';
  panels.pose.append(pieces.hand, resultsEmpty, pieces.overlays, pieces.metrics, pieces.note);
  panels.moments.append(pieces.momentsHeading, pieces.momentsCopy, pieces.phases, pieces.tempo, pieces.tempoNote, pieces.export);
  const videoNote=document.createElement('p');videoNote.className='screen-panel-help';videoNote.textContent='Settings for the selected swing. Match Frame rate to your source video for accurate stepping.';panels.video.append(videoNote);
  slots.forEach((s,i)=>{
    const group=document.createElement('div');group.dataset.settingsSlot=i;group.className='screen-video-settings';
    const title=document.createElement('h3');title.textContent=`Swing ${i?'B':'A'}`;group.append(title);
    const review = $('analysisTarget').querySelector(`[data-select="${i}"]`);
    review.className = 'slot-badge'; review.textContent = i ? 'B' : 'A';
    review.setAttribute('aria-label', `Review swing ${i?'B':'A'}`);
    review.title = `Select swing ${i?'B':'A'} for drawing and analysis`;
    s.get('.slot-badge').replaceWith(review);
    s.get('.clip-timeline-row').insertBefore(s.get('.clip-timeline'), s.get('.clip-duration'));
    s.get('.clip-speed').closest('label').className = 'clip-speed-label';
    s.get('.fps-label').firstChild.textContent = 'Frame rate ';
    // Warm the selectors before moving their nodes out of the video card.
    for(const selector of ['.mirror','.fps','.fps-label','.zoom-pan','.zoom-fit']) s.get(selector);
    group.append(s.get('.mirror'), s.get('.fps-label'), s.get('.zoom-pan'), s.get('.zoom-fit'));
    panels.video.append(group);
    s.get('.clip-transport').setAttribute('aria-label', `Swing ${i?'B':'A'} playback controls`);
    s.get('.clip-frame-controls').insertBefore(s.get('.clip-play'),s.get('.clip-next'));
  });
  const inspectorHeader=document.createElement('div');inspectorHeader.className='screen-panel-heading';
  inspectorHeader.innerHTML='<h2 id="screenPanelTitle">Analysis range</h2><button id="closePanel" aria-label="Close controls panel">Back to video</button>';
  const clearMarks = pieces.clearMarks;
  clearMarks.setAttribute('aria-label', 'Clear swing moments');
  inspectorHeader.insertBefore(clearMarks, inspectorHeader.lastElementChild);
  inspector.replaceChildren(inspectorHeader,...Object.values(panels));
  // A compact range editor stays readable even on a phone-sized controls panel.
  $('rangeTitle').textContent='Up to 20 seconds';
  $('rangeSetStart').textContent=$('rangeSetEnd').textContent='Set here';
  $('rangeSetStart').setAttribute('aria-label','Set analysis start at current frame');
  $('rangeSetEnd').setAttribute('aria-label','Set analysis end at current frame');
  $('rangeGoStart').textContent=$('rangeGoEnd').textContent='Go';
  $('rangeGoStart').setAttribute('aria-label','Go to range start');$('rangeGoEnd').setAttribute('aria-label','Go to range end');
  $('analyzeSelection').textContent='Analyze range';
  const editRange=pieces.summary.querySelector('a');editRange.onclick=e=>{e.preventDefault();open('range');};

  function apply() {
    $('clearMarks').hidden=collapsed||current!=='moments';
    inspector.hidden=collapsed; $('workspace').classList.toggle('insights-hidden',collapsed);
    studio.classList.toggle('panel-open',!collapsed);
    $('toggleInsights').textContent=collapsed?'Show panel':'Hide panel';$('toggleInsights').setAttribute('aria-expanded',!collapsed);
    for(const [id,panel] of Object.entries(panels)) panel.hidden=collapsed||id!==current;
    tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected',!collapsed&&b.dataset.panel===current);b.tabIndex=b.dataset.panel===current?0:-1;});
    $('screenPanelTitle').textContent=(current==='range'?'Range · 20s max':definitions.find(([id])=>id===current)[1]);
    update(); changed();
  }
  function open(id) { current=id;collapsed=false;apply(); }
  function close({restoreFocus = false} = {}) {
    const focusWasInside = inspector.contains(document.activeElement);
    collapsed = true; apply();
    if (restoreFocus || focusWasInside) tabs.querySelector(`[data-panel="${current}"]`).focus({preventScroll:true});
  }
  tabs.addEventListener('click',e=>{const b=e.target.closest('[data-panel]');if(b) open(b.dataset.panel);});
  tabs.addEventListener('keydown',e=>{
    if(e.key==='Tab' && !e.shiftKey && !collapsed) {
      e.preventDefault(); panels[current].focus({preventScroll:true}); return;
    }
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const buttons=[...tabs.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;
    open(buttons[next].dataset.panel);buttons[next].focus({preventScroll:true});
  });
  $('toggleInsights').onclick=()=>{collapsed=!collapsed;apply();};$('closePanel').onclick=()=>close({restoreFocus:true});
  studio.addEventListener('click',e=>{if(e.target.closest('[data-tool]') && compact.matches) close();});
  studio.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&!collapsed){close();tabs.querySelector(`[data-panel="${current}"]`).focus({preventScroll:true});}});
  inspector.addEventListener('keydown',e=>{
    if(e.key==='Tab' && e.shiftKey && Object.values(panels).includes(e.target)) {
      e.preventDefault(); tabs.querySelector(`[data-panel="${current}"]`).focus({preventScroll:true});
    }
  });
  // Keep the user's current panel open through resizing or device rotation.
  compact.addEventListener('change',apply);
  // CSS flex sizing changes when panels open, even without a window resize.
  const observer=new ResizeObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;changed();});});
  slots.forEach(s=>observer.observe(s.stage));
  function update() {
    const {active,mode,linked,busy}=state();
    studio.classList.toggle('independent-playback',mode==='compare'&&!linked);
    studio.classList.toggle('is-compare',mode==='compare');studio.classList.toggle('is-analyzing',busy);
    panels.video.querySelectorAll('[data-settings-slot]').forEach(el=>el.hidden=Number(el.dataset.settingsSlot)!==active);
    const s = slots[active], hasResults = !!s.analyzedRange;
    $('resultsEmpty').hidden = hasResults;
    pieces.metrics.hidden = !hasResults; pieces.note.hidden = !hasResults;
    $('viewResults').hidden = !hasResults || busy;
    inspector.setAttribute('aria-label', `Controls for swing ${active?'B':'A'}`);
    studio.classList.toggle('has-video', slots.some(s=>s.ready));
    $('status').title=$('status').textContent;
  }
  for (const b of studio.querySelectorAll('[data-tool]')) b.setAttribute('aria-label', b.title);
  $('drawingUndo').setAttribute('aria-label','Undo drawing'); $('drawingRedo').setAttribute('aria-label','Redo drawing');
  studio.classList.add('screen-ready');apply();
  return { update, open, close, focus:()=>studio.scrollIntoView({block:'start',behavior:'auto'}) };
}
