const preview = document.querySelector('.rare-preview');
preview.querySelectorAll('[data-icon]').forEach(button => button.addEventListener('click', () => {
  preview.querySelectorAll('.active-icon').forEach(badge => badge.style.setProperty('--badge-icon', `url('/icons/achievement-preview/${button.dataset.icon}.svg')`));
  preview.querySelectorAll('[data-icon]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
}));
preview.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click', () => {
  preview.style.setProperty('--tone-a', button.dataset.a);
  preview.style.setProperty('--tone-b', button.dataset.b);
  preview.querySelectorAll('[data-palette]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
}));
const pauseButton = preview.querySelector('#pauseEffects');
const status = preview.querySelector('#motionStatus');
function setPaused(paused) {
  preview.classList.toggle('paused', paused);
  preview.classList.toggle('play-motion', !paused);
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.textContent = paused ? '재생' : '일시정지';
  status.textContent = paused ? '빛 효과 일시정지' : '빛 효과 재생 중';
}
setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
pauseButton.addEventListener('click', () => setPaused(!preview.classList.contains('paused')));
