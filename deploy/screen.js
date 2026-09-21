// Persistent sections reuse the original controls and handlers.
// Moving focus or resizing never reloads media or collapses a section.
export function createStudioScreen({ slots, state, changed }) {
  const $ = id => document.getElementById(id);
  const studio = $('studio'), inspector = $('analysisPanel');
  let scheduled = false;
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
  $('toggleInsights').remove();
  const help = document.createElement('button');
  help.id = 'workspaceHelp'; help.className = 'workspace-help'; help.textContent = 'Help';
  help.setAttribute('aria-haspopup','dialog'); heading.append(help);
  const footer = studio.querySelector('.transport'); footer.classList.add('screen-transport');
  // Synchronization and alignment belong with the player that controls both clips.
  footer.prepend($('comparisonBar'));
  studio.append(footer);
  const commands = document.createElement('div'); commands.className = 'screen-commands';
  const context = document.createElement('button'); context.id = 'reviewContext'; context.className = 'review-context';
  context.title = 'Change the analysis range'; context.onclick = () => focusSection('range');
  commands.append(context, $('analyze'), $('cancel')); footer.querySelector('.transport-row').append(commands);
  const notice = document.createElement('div'); notice.className = 'screen-notice';
  notice.append($('status'), $('drawingHint'), $('progress')); footer.append(notice);
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
  panels.range.append($('rangeSelection'), pieces.summary);
  pieces.note.textContent='2D estimates at the playhead. Camera angle and visibility affect accuracy.';
  const resultsEmpty = document.createElement('p'); resultsEmpty.id = 'resultsEmpty'; resultsEmpty.className = 'screen-panel-help';
  resultsEmpty.textContent = 'Choose a range, then Analyze. You can play and draw without analysis.';
  panels.pose.append(pieces.hand, resultsEmpty, pieces.overlays, pieces.metrics, pieces.note);
  panels.moments.append(pieces.momentsHeading, pieces.momentsCopy, pieces.phases, pieces.tempo, pieces.tempoNote, pieces.export);
  const videoNote=document.createElement('p');videoNote.className='screen-panel-help';videoNote.textContent='Match Frame rate to your video for accurate stepping.';panels.video.append(videoNote);
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
  const inspectorHeader=document.createElement('div');inspectorHeader.className='sidebar-heading';
  inspectorHeader.innerHTML='<h2>Tools & analysis</h2>';
  const target=panels.draw.querySelector('.drawing-target');
  inspectorHeader.append(target);
  pieces.clearMarks.setAttribute('aria-label', 'Clear swing moments');
  panels.moments.querySelector('.section-heading').append(pieces.clearMarks);
  const sections=document.createElement('div');sections.className='sidebar-sections';sections.append(...Object.values(panels));
  inspector.replaceChildren(inspectorHeader,sections);
  inspector.hidden=false;studio.append(inspector);
  // A compact range editor stays readable even on a phone-sized controls panel.
  $('rangeTitle').textContent='Up to 20 seconds';
  $('rangeSetStart').textContent=$('rangeSetEnd').textContent='Set here';
  $('rangeSetStart').setAttribute('aria-label','Set analysis start at current frame');
  $('rangeSetEnd').setAttribute('aria-label','Set analysis end at current frame');
  $('rangeGoStart').textContent=$('rangeGoEnd').textContent='Go';
  $('rangeGoStart').setAttribute('aria-label','Go to range start');$('rangeGoEnd').setAttribute('aria-label','Go to range end');
  $('analyzeSelection').textContent='Analyze range';
  const editRange=pieces.summary.querySelector('a');editRange.onclick=e=>{e.preventDefault();focusSection('range');};

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
  function update() {
    const {active,mode,linked,busy}=state();
    studio.classList.toggle('independent-playback',mode==='compare'&&!linked);
    studio.classList.toggle('is-compare',mode==='compare');studio.classList.toggle('is-analyzing',busy);
    panels.video.querySelectorAll('[data-settings-slot]').forEach(el=>el.hidden=Number(el.dataset.settingsSlot)!==active);
    const s = slots[active], hasResults = !!s.analyzedRange;
    $('resultsEmpty').hidden = hasResults;
    panels.video.querySelectorAll('[data-settings-slot] h3').forEach((title,i)=>{title.textContent=slots[i].get('.file-name').textContent;});
    pieces.metrics.hidden = !hasResults; pieces.note.hidden = !hasResults;
    $('viewResults').hidden = !hasResults || busy;
    inspector.setAttribute('aria-label', `Controls for swing ${active?'B':'A'}`);
    studio.classList.toggle('has-video', slots.some(s=>s.ready));
    $('status').title=$('status').textContent;
  }
  for (const b of studio.querySelectorAll('[data-tool]')) b.setAttribute('aria-label', b.title);
  $('drawingUndo').setAttribute('aria-label','Undo drawing'); $('drawingRedo').setAttribute('aria-label','Redo drawing');
  studio.classList.add('screen-ready','persistent-sidebar');update();changed();
  return { update, focusSection, focus:focusVideo };
}
