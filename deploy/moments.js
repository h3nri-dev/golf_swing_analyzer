import { frameNumber, frameStamp, lastFrame, markedFrame } from './timing.js';

export const MOMENTS = [['address','Address'],['top','Top of backswing'],['impact','Impact'],['finish','Finish']];

export function createMoments({slots, state, controlClip, pause, seek, changed}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'momentDialog'; dialog.className = 'moment-dialog';
  dialog.setAttribute('aria-labelledby','momentDialogTitle');
  dialog.innerHTML = '<header><h2 id="momentDialogTitle">Swing moments</h2><button class="moment-close" aria-label="Close moment editor">×</button></header><p>Jump to a moment, edit its frame, or use <strong>Set here</strong>. Times use your FPS settings; the first frame is 0.</p><div class="moment-rows"></div><p class="moment-error" role="alert" hidden></p>';
  document.body.append(dialog);
  let editing = 0;
  const rows = MOMENTS.map(([key,label]) => {
    const row = document.createElement('div'); row.className = 'moment-edit-row';
    row.innerHTML = `<button class="moment-jump"><strong>${label}</strong><span></span></button><label>Frame<input type="number" min="0" step="1"></label><button class="moment-set">Set here</button><button class="moment-delete" aria-label="Delete ${label} moment">×</button>`;
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
    row.querySelector('.moment-jump').onclick = () => { const time = slots[editing].marks[key]; dialog.close(); controlClip(editing,()=>seek(time)); };
    return {key,label,row,input};
  });
  function renderEditor() {
    const s = slots[editing];
    dialog.querySelector('h2').textContent = `Swing ${editing?'B':'A'} moments`;
    rows.forEach(({key,label,row,input}) => {
      const time = s.marks[key], exists = Number.isFinite(time);
      row.querySelector('.moment-jump').disabled = !exists;
      row.querySelector('.moment-jump').setAttribute('aria-label',`Jump to ${label} in swing ${editing?'B':'A'}`);
      row.querySelector('span').textContent = exists ? frameStamp(time,s) : 'Not marked';
      input.value = exists ? frameNumber(time,s.fps) : '';
      input.max = lastFrame(s.video.duration,s.fps); input.removeAttribute('aria-invalid');
      input.setAttribute('aria-label',`${label} frame in swing ${editing?'B':'A'}`);
      row.querySelector('.moment-delete').disabled = !exists;
    });
  }
  function open(index,key) {
    controlClip(index, pause); editing = index; renderEditor();
    dialog.querySelector('.moment-error').hidden = true;
    dialog.showModal();
    const anchor = slots[index].get('.clip-moments').getBoundingClientRect();
    dialog.style.left = `${Math.max(8, Math.min(anchor.left,innerWidth-dialog.offsetWidth-8))}px`;
    dialog.style.top = `${Math.max(8, Math.min(anchor.bottom+8,innerHeight-dialog.offsetHeight-8))}px`;
    (key ? rows.find(r=>r.key===key).input : dialog.querySelector('.moment-close')).focus();
  }
  dialog.querySelector('.moment-close').onclick = () => dialog.close();
  slots.forEach((s,index) => {
    const select = document.createElement('select'); select.className = 'clip-moments';
    select.setAttribute('aria-label',`Moments for swing ${index?'B':'A'}`);
    select.title = 'Jump to a saved moment or add and edit markers';
    s.get('.clip-play').after(select); s.get('.clip-moments');
    select.onchange = () => {
      const key = select.value; select.value = '';
      if (key === 'edit' || !Number.isFinite(s.marks[key])) open(index,key === 'edit' ? null : key);
      else controlClip(index,()=>seek(s.marks[key]));
    };
  });
  function render() {
    const {mode,busy} = state();
    slots.forEach((s,index) => {
      const select = s.get('.clip-moments'); select.disabled = !s.ready || busy;
      const after = mode === 'single' && index === 0 ? document.getElementById('play') : s.get('.clip-play');
      if (after.nextElementSibling !== select) after.after(select);
      const options = [['',`Moments${Object.keys(s.marks).length ? ` (${Object.keys(s.marks).length})` : ''}`],
        ...MOMENTS.map(([key,label]) => [key,Number.isFinite(s.marks[key]) ? `${label} · ${frameStamp(s.marks[key],s)}` : `+ Mark ${label}`]),['edit','Add / edit moments…']];
      const signature = JSON.stringify(options);
      if (select.dataset.options !== signature) {
        select.replaceChildren(...options.map(([value,label]) => new Option(label,value)));
        select.dataset.options = signature;
      }
      select.value = '';
    });
  }
  return {render};
}
