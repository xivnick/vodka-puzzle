const preview=document.querySelector('.material-preview');
const templates=new Map([...preview.querySelectorAll('template[data-icon-template]')].map(template=>[template.dataset.iconTemplate,template]));
preview.querySelectorAll('[data-icon-choice]').forEach(button=>button.addEventListener('click',()=>{
  const id=button.dataset.iconChoice;
  preview.querySelectorAll('.active-material').forEach(badge=>{
    badge.querySelectorAll('.material-geometry').forEach(group=>group.replaceChildren(...[...templates.get(id).content.querySelector('svg').childNodes].map(node=>node.cloneNode(true))));
    badge.dataset.materialIcon=id;
  });
  preview.querySelectorAll('[data-icon-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
preview.querySelectorAll('[data-palette]').forEach(button=>button.addEventListener('click',()=>{
  preview.style.setProperty('--tone-a',button.dataset.a);
  preview.style.setProperty('--tone-b',button.dataset.b);
  preview.querySelectorAll('[data-palette]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
const pause=preview.querySelector('#pauseMaterials');
function setPaused(paused){
  preview.classList.toggle('paused',paused);
  pause.setAttribute('aria-pressed',String(paused));
  pause.textContent=paused?'재생':'일시정지';
}
setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
pause.addEventListener('click',()=>setPaused(!preview.classList.contains('paused')));

// Pause clipped and offscreen previews instead of animating the entire comparison page.
if ('IntersectionObserver' in window) {
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>entry.target.classList.toggle('is-visible',entry.isIntersecting));
  },{threshold:0});
  preview.classList.add('visibility-managed');
  preview.querySelectorAll('.material-badge').forEach(badge=>observer.observe(badge));
}
const updateVisibility=()=>preview.classList.toggle('page-hidden',document.hidden);
document.addEventListener('visibilitychange',updateVisibility);
updateVisibility();
