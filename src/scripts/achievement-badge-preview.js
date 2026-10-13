(() => {
  const finishes = JSON.parse(document.getElementById('badgeFinishes').textContent);

  const dialog = document.getElementById('badgeDetails');
  const largeBadge = document.getElementById('largeBadge');
  let selectedButton;
  const accessibleLabel = (button,finish) => `${button.dataset.name}의 뱃지: ${button.dataset.achievement}, ${finish.label}, ${finish.type}`;
  function setFinish(id) {
    const finish = finishes.find(finish => finish.id === id);
    if (!selectedButton || !finish) return;
    selectedButton.dataset.finish = id;
    selectedButton.setAttribute('aria-label',accessibleLabel(selectedButton,finish));
    selectedButton.title = `${selectedButton.dataset.achievement} · ${finish.label} (${finish.type})`;
    for (const badge of [selectedButton.querySelector('.preview-badge'),largeBadge]) {
      badge.className = `preview-badge effect-${finish.effect}`;
      badge.style.setProperty('--icon',`url('/icons/achievement-preview/${selectedButton.dataset.icon}.svg')`);
      badge.style.setProperty('--tone-a',finish.colors[0]);
      badge.style.setProperty('--tone-b',finish.colors[1]);
    }
    document.getElementById('finishDescription').textContent = `${finish.label} · ${finish.type}`;
    document.querySelectorAll('[data-finish-choice]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.finishChoice === id)));
  }
  function openBadge(button) {
    selectedButton = button;
    document.getElementById('badgeTitle').textContent = button.dataset.achievement;
    document.getElementById('badgeCondition').textContent = button.dataset.condition;
    setFinish(button.dataset.finish);
    dialog.showModal();
  }
  document.querySelectorAll('.badge-button').forEach(button => button.addEventListener('click',()=>openBadge(button)));
  document.querySelectorAll('[data-preview-finish]').forEach(button => button.addEventListener('click',()=>{
    openBadge(document.querySelector(`.badge-button[data-finish="${button.dataset.previewFinish}"]`) || document.querySelector('.badge-button'));
    setFinish(button.dataset.previewFinish);
  }));
  document.querySelectorAll('[data-finish-choice]').forEach(button => button.addEventListener('click',()=>setFinish(button.dataset.finishChoice)));
  dialog.addEventListener('click',event=>{ if(event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close(); } });
  document.getElementById('pauseEffects').addEventListener('click',event=>{
    const paused = document.body.classList.toggle('effects-paused');
    event.currentTarget.setAttribute('aria-pressed',String(paused));
    event.currentTarget.textContent = paused ? '효과 재생하기' : '효과 멈추기';
  });

})();
