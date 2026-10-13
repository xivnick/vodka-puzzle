const preview = document.querySelector('.common-preview');
let selectedIcon = 'star';
let selectedColorName = preview.querySelector('[data-color][aria-pressed="true"]').dataset.colorName;
const iconNames = Object.fromEntries([...preview.querySelectorAll('[data-icon-choice]')].map(button=>[button.dataset.iconChoice,button.getAttribute('aria-label')]));
preview.querySelectorAll('[data-icon-choice]').forEach(button=>button.addEventListener('click',()=>{
  selectedIcon = button.dataset.iconChoice;
  const mask = `url('/icons/achievement-preview/${selectedIcon}.svg')`;
  preview.querySelectorAll('.palette-badge,.selected-name .color-badge').forEach(badge=>badge.style.setProperty('--badge-icon',mask));
  preview.querySelector('.selected-name .color-badge').setAttribute('aria-label',`${selectedColorName}색 ${iconNames[selectedIcon]} 뱃지`);
  preview.querySelectorAll('[data-icon-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
preview.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
  selectedColorName=button.dataset.colorName;
  preview.querySelectorAll('.selected-badge').forEach(badge=>{
    badge.style.setProperty('--badge-color',button.dataset.color);
    badge.setAttribute('aria-label',`${selectedColorName}색 ${badge.dataset.iconLabel || iconNames[selectedIcon]} 뱃지`);
  });
  const name=preview.querySelector('#selectedColorName');
  name.replaceChildren(document.createTextNode(selectedColorName+' '));
  const hex=document.createElement('span');
  hex.className='hex';
  hex.textContent=button.dataset.color;
  name.append(hex);
  preview.querySelectorAll('[data-color]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));
