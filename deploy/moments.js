import { frameNumber, frameStamp, lastFrame, markedFrame } from './timing.js';

import { KEY_MOMENTS as MOMENTS, keyMomentEntries, MOMENT_COLORS } from './keyframes.js';

export function createMoments({slots, state, controlClip, pause, seek, changed}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'momentDialog'; dialog.className = 'moment-dialog';
  dialog.setAttribute('aria-labelledby','momentDialogTitle');
  dialog.innerHTML = '<header><h2 id="momentDialogTitle">Swing moments</h2><button class="moment-close" aria-label="Close moment editor">×</button></header><p>Jump to a moment, edit its frame, or use <strong>Set here</strong>. Automatic estimates are filled in. Your edits take priority; ↺ restores an estimate. Frames start at 0.</p><div class="moment-rows"></div><p class="moment-error" role="alert" hidden></p>';
  document.body.append(dialog);
  let editing = 0;
  const rows = MOMENTS.map(([key,label]) => {
    const row = document.createElement('div'); row.className = 'moment-edit-row'; row.style.setProperty('--moment-color',MOMENT_COLORS[key]);
    row.innerHTML = `<button class="moment-jump"><strong>${label}</strong><span></span></button><label>Frame<input type="number" min="0" step="1"></label><button class="moment-set">Set here</button><button class="moment-delete" aria-label="Reset ${label} moment" title="Remove your edit and restore the automatic estimate, if available">×</button>`;
    dialog.querySelector('.moment-rows').append(row);
    const input = row.querySelector('input');
    function save(time) {
      slots[editing].marks[key] = time; dialog.querySelector('.moment-error').hidden = true;
      changed(); renderEditor();
    }
    input.onchange = () => {
      const frame = input.valueAsNumber, s = slots[editing];
      if (!Number.isInteger(frame) || frame < 0 || frame > lastFrame(s.video.duration,s.fps)) {
        const error = dialog.querySelector('.moment-error'); error.textContent = `Enter a whole frame from 0 to ${lastFrame(s.video.duration,s.fps)}.`; error.hidden = false;
        input.setAttribute('aria-invalid','true'); return;
      }
      save(frame / s.fps);
    };
    row.querySelector('.moment-set').onclick = () => save(markedFrame(slots[editing].video.currentTime,slots[editing]));
    row.querySelector('.moment-delete').onclick = () => { delete slots[editing].marks[key]; dialog.querySelector('.moment-error').hidden = true; changed(); renderEditor(); };
    row.querySelector('.moment-jump').onclick = () => { const time = keyMomentEntries(slots[editing]).find(e=>e.key===key).time; dialog.close(); controlClip(editing,()=>seek(time)); };
    return {key,label,row,input};
  });
  function renderEditor() {
    const s = slots[editing];
    dialog.querySelector('h2').textContent = `Swing ${editing?'B':'A'} moments`;
    rows.forEach(({key,label,row,input}) => {
      const entry = keyMomentEntries(s).find(e=>e.key===key), time = entry.time, exists = Number.isFinite(time) && entry.source !== 'sampled';
      row.querySelector('.moment-jump').disabled = !exists;
      row.querySelector('.moment-jump').setAttribute('aria-label',`Jump to ${label} in swing ${editing?'B':'A'}`);
      row.querySelector('span').textContent = exists ? frameStamp(time,s) : 'Not marked';
      input.value = exists ? frameNumber(time,s.fps) : '';
      input.max = lastFrame(s.video.duration,s.fps); input.removeAttribute('aria-invalid');
      input.setAttribute('aria-label',`${label} frame in swing ${editing?'B':'A'}`);
      const reset=row.querySelector('.moment-delete');reset.disabled = !Number.isFinite(s.marks[key]);reset.textContent=s.keyMoments?.some(e=>e.key===key&&e.source==='estimated')?'↺':'×';
    });
  }
  function open(index,key) {
    controlClip(index, pause); editing = index; renderEditor();
    dialog.querySelector('.moment-error').hidden = true;
    dialog.showModal();
    const anchor = document.getElementById('keyMomentStrip').getBoundingClientRect();
    dialog.style.left = `${Math.max(8, Math.min(anchor.left,innerWidth-dialog.offsetWidth-8))}px`;
    dialog.style.top = `${Math.max(8, Math.min(anchor.bottom+8,innerHeight-dialog.offsetHeight-8))}px`;
    (key ? rows.find(r=>r.key===key).input : dialog.querySelector('.moment-close')).focus();
  }
  dialog.querySelector('.moment-close').onclick = () => dialog.close();
  function set(index,key) {
    if(state().busy||!slots[index].ready)return;
    controlClip(index,()=>{pause();slots[index].marks[key]=markedFrame(slots[index].video.currentTime,slots[index]);changed();});
  }
  function render() {if(dialog.open)renderEditor();}
  return {render,open,set};
}
