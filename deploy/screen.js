// Persistent sections reuse the original controls and handlers.
// Moving focus or resizing never reloads media or collapses a section.
export function createStudioScreen({ slots, state, changed, analyzeSlot }) {
  const $ = id => document.getElementById(id);
  const studio = $('studio'), inspector = $('analysisPanel');
  let scheduled = false;
  const definitions = [['draw','Draw'],['video','Video'],['pose','Results'],['moments','Moments']];
  const original = selector => inspector.querySelector(selector);
  const pieces = {
    hand: original('.setting-row'),
    overlays: original('.overlay-options'), metrics: $('metrics'), note: original('.metric-note'),
    tempo: original('.tempo'), tempoNote: $('tempoNote'), export: $('export'),
  };
  const heading = studio.querySelector('.studio-heading');
  heading.append($('analysisTarget'));
  $('toggleInsights').remove();
  const help = document.createElement('button');
  help.id = 'workspaceHelp'; help.className = 'workspace-help'; help.textContent = 'Help';
  help.setAttribute('aria-haspopup','dialog'); heading.append(help);
  const footer = studio.querySelector('.transport'); footer.classList.add('screen-transport');
  // Synchronization and alignment belong with the player that controls both clips.
  footer.prepend($('comparisonBar'));
  studio.append(footer);
  const notice = document.createElement('div'); notice.className = 'screen-notice';
  notice.append($('status'), $('drawingHint'), $('progress'), $('analyzedRangeNote')); footer.append(notice);
  footer.append(document.querySelector('[data-consent-banner]'));
  const resultsAction = document.createElement('button'); resultsAction.id = 'viewResults'; resultsAction.textContent = 'View results'; resultsAction.hidden = true;
  resultsAction.onclick = () => focusSection('pose');
  notice.append(resultsAction);
  const panels = Object.fromEntries(definitions.map(([id,label])=>{
    const section=document.createElement('section');section.id=`panel-${id}`;section.className='screen-panel';
    section.tabIndex = -1; section.setAttribute('aria-labelledby',`section-title-${id}`);
    const title=document.createElement('h2');title.id=`section-title-${id}`;title.textContent=label;
    const header=document.createElement('div');header.className='section-heading';header.append(title);section.append(header);
    return [id, section];
  }));
  panels.draw.append($('drawingSettings'), $('drawingActions'));
  panels.draw.querySelector('.drawing-settings-panel').append(panels.draw.querySelector('.drawing-footer'));
  const rangeTargets=document.createElement('div');rangeTargets.className='range-targets';
  rangeTargets.setAttribute('role','group');rangeTargets.setAttribute('aria-label','Choose swing to analyze');
  slots.forEach((s,i)=>{
    const button=document.createElement('button');button.dataset.rangeSlot=i;button.textContent=i?'B':'A';
    button.setAttribute('aria-label',`Analyze range for swing ${i?'B':'A'}`);
    button.onclick=()=>document.querySelector(`[data-select="${i}"]`).click();rangeTargets.append(button);
  });
  const common=document.createElement('div');common.id='commonPlayer';common.className='common-player';
  common.setAttribute('role','group');common.setAttribute('aria-label','Playback controls');
  common.append($('comparisonBar'),footer.querySelector('.transport-row'),footer.querySelector('.timeline-row'));footer.insertBefore(common,notice);
  panels.range=common;common.tabIndex=-1;
  const controls=common.querySelector('.transport-row');
  controls.querySelector('.speed-label').after($('analyze'), $('cancel'), rangeTargets);
  const hint=document.createElement('span');hint.id='analysisWindowHint';hint.className='analysis-window-hint';
  hint.textContent='Analyze −0.3s / +3.2s';
  hint.title='The light-green analysis window follows playback, using real time and stopping at clip edges.';
  const description=document.createElement('div');description.className='timeline-description';description.append(hint);
  common.querySelector('.timeline-row').prepend(description);
  pieces.note.textContent='2D estimates at the playhead. Camera angle and visibility affect accuracy.';
  const resultsEmpty = document.createElement('p'); resultsEmpty.id = 'resultsEmpty'; resultsEmpty.className = 'screen-panel-help';
  resultsEmpty.textContent = 'Pause at your swing, then Analyze. You can play and draw without analysis.';
  panels.pose.append(pieces.hand, resultsEmpty, pieces.overlays, pieces.metrics, pieces.note);
  panels.moments.append(pieces.tempo, pieces.tempoNote, pieces.export);
  panels.moments.querySelector('h2').textContent='Tempo & report';
  const videoNote=document.createElement('p');videoNote.className='screen-panel-help';videoNote.textContent='File FPS is detected automatically. Slow-motion export? Set Shot FPS to the recording rate. Otherwise leave Same.';panels.video.append(videoNote);
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
    s.get('.fps-label').firstChild.textContent = 'File FPS ';
    s.get('.fps-label').title = 'Frame rate saved in the video file. Use Shot FPS for the camera’s recording rate when this is a slow-motion export.';
    s.get('.clip-timing').prepend(s.get('.fps-label'));
    s.get('.zoom-controls').before(s.get('.clip-timing'));
    // Warm the selectors before moving their nodes out of the video card.
    for(const selector of ['.mirror','.fps','.fps-label','.zoom-pan','.zoom-fit']) s.get(selector);
    group.append(s.get('.mirror'), s.get('.zoom-pan'));
    s.get('.zoom-controls').append(s.get('.zoom-fit'));
    s.get('.zoom-fit').setAttribute('aria-label',`Fit swing ${i?'B':'A'} to view`);
    panels.video.append(group);
    const viewSettings=document.createElement('div');viewSettings.className='clip-view-settings';
    s.get('.clip-transport').before(viewSettings);viewSettings.append(s.get('.clip-timing'),s.get('.zoom-controls'));
    s.get('.clip-transport').setAttribute('aria-label', `Swing ${i?'B':'A'} playback controls`);
    s.get('.clip-playback-buttons').insertBefore(s.get('.clip-play'),s.get('.clip-next'));
    const analyze=document.createElement('button');analyze.className='clip-analyze';
    analyze.textContent=`Analyze ${i?'B':'A'}`;
    analyze.onclick=()=>analyzeSlot(i);
    s.get('.clip-speed').closest('label').after(analyze);
    s.get('.clip-frame-controls').append(s.get('.clip-restart'));
  });
  const inspectorHeader=document.createElement('div');inspectorHeader.className='sidebar-heading';
  const target=panels.draw.querySelector('.drawing-target');
  panels.draw.querySelector('.section-heading').append(target);
  const sections=document.createElement('div');sections.className='sidebar-sections';sections.append(...Object.entries(panels).filter(([id])=>id!=='range').map(([,panel])=>panel));
  inspector.replaceChildren(inspectorHeader,sections);
  inspector.hidden=false;studio.append(inspector);
  // End the page at the workspace. Legal links stay visible without creating
  // another scrolling destination beyond the video controls.
  const legalFooter = $('studioFooter');
  const desktop = matchMedia('(min-width: 901px)');
  // No full-width title row on desktop: session controls share the existing
  // inspector. On phones keep the mode switch above the players, in one row.
  const placeSessionControls = () => {
    if (desktop.matches) inspectorHeader.append(heading);
    else studio.prepend(heading);
  };
  desktop.addEventListener('change', placeSessionControls);
  placeSessionControls();
  const placeLegalFooter = () => (desktop.matches ? notice : studio).append(legalFooter);
  desktop.addEventListener('change', placeLegalFooter);
  placeLegalFooter();

  function focusSection(id) {
    const section=panels[id]; if(!section) return;
    section.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    section.focus({preventScroll:true});
  }
  function focusVideo() {
    studio.scrollIntoView({block:'start',behavior:'instant'});
  }
  // Track video geometry as controls reflow or the viewport changes.
  const observer=new ResizeObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;changed();});});
  slots.forEach(s=>observer.observe(s.stage));
  const footerObserver=new ResizeObserver(()=>{
    const total=Math.ceil(footer.getBoundingClientRect().height+(desktop.matches?0:heading.getBoundingClientRect().height)+2);
    studio.style.setProperty('--review-chrome-height',`${total}px`);
  });
  footerObserver.observe(footer);footerObserver.observe(heading);
  function update() {
    const {active,mode,linked,busy}=state();
    studio.classList.toggle('independent-playback',mode==='compare'&&!linked);
    studio.classList.toggle('is-compare',mode==='compare');studio.classList.toggle('is-analyzing',busy);
    panels.video.querySelectorAll('[data-settings-slot]').forEach(el=>el.hidden=Number(el.dataset.settingsSlot)!==active);
    const s = slots[active], hasResults = mode==='compare'?slots.some(s=>!!s.analyzedRange):!!s.analyzedRange;
    rangeTargets.hidden=mode!=='compare';
    target.hidden=mode!=='compare';
    slots.forEach(slot=>slot.get('.slot-badge').hidden=mode!=='compare');
    rangeTargets.querySelectorAll('button').forEach((button,i)=>{button.disabled=busy;button.setAttribute('aria-pressed',i===active);});
    $('resultsEmpty').hidden = !!s.analyzedRange;
    $('resultsEmpty').textContent=mode==='compare'&&hasResults?`Analyze swing ${active?'B':'A'} to fill its measurements. The other video’s results remain shown.`:'Pause at your swing, then Analyze. You can play and draw without analysis.';
    panels.video.querySelectorAll('[data-settings-slot] h3').forEach((title,i)=>{title.textContent=slots[i].get('.file-name').textContent;});
    pieces.metrics.hidden = !hasResults; pieces.note.hidden = !hasResults;
    $('viewResults').hidden = !hasResults || busy;
    inspector.setAttribute('aria-label', mode==='compare' ? `Controls for swing ${active?'B':'A'}` : 'Tools and analysis');
    studio.classList.toggle('has-video', slots.some(s=>s.ready));
    $('status').title=$('status').textContent;
  }
  for (const b of studio.querySelectorAll('[data-tool]')) b.setAttribute('aria-label', b.title);
  $('drawingUndo').setAttribute('aria-label','Undo drawing'); $('drawingRedo').setAttribute('aria-label','Redo drawing');
  studio.classList.add('screen-ready','persistent-sidebar');update();changed();
  return { update, focusSection, focus:focusVideo };
}
