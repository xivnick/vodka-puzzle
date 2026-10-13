const preview = document.querySelector('.uncommon-preview');
preview.querySelectorAll('[data-icon-choice]').forEach(button=>button.addEventListener('click',()=>{
  const mask=`url('/icons/achievement-preview/${button.dataset.iconChoice}.svg')`;
  preview.querySelectorAll('.active-icon').forEach(badge=>badge.style.setProperty('--badge-icon',mask));
  preview.querySelectorAll('[data-icon-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
preview.querySelectorAll('[data-angle]').forEach(button=>button.addEventListener('click',()=>{
  preview.style.setProperty('--color-angle',button.dataset.angle);
  preview.querySelectorAll('[data-angle]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
preview.querySelectorAll('[data-finish]').forEach(button=>button.addEventListener('click',()=>{
  preview.dataset.selectedMode=button.dataset.mode;
  preview.style.setProperty('--selected-a',button.dataset.toneA);
  preview.style.setProperty('--selected-b',button.dataset.toneB);
  preview.querySelector('#selectedFinishName').textContent=button.dataset.finishName;
  preview.querySelectorAll('[data-finish]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
