// Task help and safeguards use native dialogs for focus containment and Escape.
const $ = id => document.getElementById(id);

export function createTaskHelp({ screen, compare }) {
  const about = $('aboutDialog');
  $('closeAbout').onclick = () => about.close();
  document.querySelectorAll('[data-open-about]').forEach(button => {
    button.onclick = () => {
      const parentDialog = button.closest('dialog');
      if (parentDialog) { parentDialog.close(); $('workspaceHelp').focus({ preventScroll: true }); }
      about.showModal();
    };
  });
  const dialog = $('helpDialog');
  $('workspaceHelp').onclick = () => dialog.showModal();
  $('closeHelp').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-help-task]').forEach(button => {
    button.onclick = () => {
      dialog.close();
      const task = button.dataset.helpTask;
      if (task === 'compare') { compare(); screen.focus(); }
      else screen.focusSection(task);
      const destination = task === 'compare' ? document.querySelector('[data-slot="1"] .dropzone') : task === 'range' ? $('commonPlayer') : $(`panel-${task}`);
      if (!destination?.hidden) destination?.focus({ preventScroll: true });
    };
  });
}

export function confirmDiscard(slot, action, hasWork, mode) {
  if (!hasWork) return Promise.resolve(true);
  const dialog = $('discardDialog');
  if (dialog.open) return Promise.resolve(false);
  const name = slot.card.dataset.slot === '0' ? 'A' : 'B';
  $('discardTitle').textContent = `${action} ${mode==='compare'?`swing ${name}`:'video'}?`;
  $('discardFile').textContent = slot.get('.file-name').textContent;
  $('discardConfirm').textContent = `${action} video`;
  dialog.returnValue = '';
  $('discardCancel').onclick = () => dialog.close('cancel');
  $('discardConfirm').onclick = () => dialog.close('discard');
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'discard'), { once: true });
    dialog.showModal();
    $('discardCancel').focus();
  });
}
