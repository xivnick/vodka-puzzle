import {initNicknameBadges} from './nickname-badge-alignment.js';
const root=document.querySelector('.cl-comparison');
if(root){
  const data=JSON.parse(root.querySelector('#customizeComparisonData').textContent);
  const catalog=Object.fromEntries(Object.entries(data).map(([kind,items])=>[kind,new Map(items.map(item=>[item.id,item]))]));
  const visible=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-offscreen',!entry.isIntersecting)));
  const make=(tag,className)=>{const element=document.createElement(tag);element.className=className;return element;};
  function glyph(kind,item){
    const wrapper=make('span','cl-glyph');
    if(kind==='icons'){const image=document.createElement('img');image.src=item.src;image.alt='';image.width=20;image.height=20;wrapper.append(image);}
    if(kind==='colors'){const swatch=document.createElement('i');swatch.style.background=`linear-gradient(135deg,${item.a},${item.b})`;wrapper.append(swatch);}
    wrapper.title=item.name;return wrapper;
  }
  function fitOwned(row){
    const width=row.clientWidth;if(!width)return;
    const strip=row.querySelector('.cl-owned-items'),more=row.querySelector('.cl-more'),items=[...strip.children];
    items.forEach(item=>item.hidden=false);more.hidden=true;
    const gap=parseFloat(getComputedStyle(strip).gap)||0,widths=items.map(item=>item.getBoundingClientRect().width);
    const used=count=>widths.slice(0,count).reduce((sum,n)=>sum+n,0)+Math.max(0,count-1)*gap;
    let shown=items.length;
    if(used(shown)>width){
      more.hidden=false;const rowGap=parseFloat(getComputedStyle(row).gap)||0;
      do{shown--;more.textContent=`외 ${items.length-shown}개`;}while(shown>0&&used(shown)+rowGap+more.getBoundingClientRect().width>width);
    }
    items.forEach((item,index)=>item.hidden=index>=shown);
  }
  const resize=new ResizeObserver(entries=>entries.forEach(entry=>fitOwned(entry.target)));
  root.querySelectorAll('.cl-owned').forEach(row=>resize.observe(row));
  root.querySelectorAll('.cl-example').forEach(example=>{
    const state={icons:'leaf',colors:'base',effects:'none',mode:'gradient',angle:'135deg'};
    const effectAllowed=()=>['uncommon','rare'].includes(catalog.colors.get(state.colors).rarity);
    function render(){
      if(!effectAllowed())state.effects='none';
      const color=catalog.colors.get(state.colors);
      example.querySelectorAll('.cl-picker').forEach(picker=>{
        const kind=picker.dataset.kind,item=catalog[kind].get(state[kind]);
        const current=picker.querySelector('[data-current-glyph]');current.replaceChildren(...glyph(kind,item).childNodes);
        picker.querySelector('[data-current-name]').textContent=item.name;
        picker.querySelector('.cl-picker-summary').setAttribute('aria-label',`${{icons:'아이콘',colors:'색깔',effects:'효과'}[kind]} 선택, 현재 ${item.name}`);
        picker.querySelectorAll('[data-value]').forEach(button=>{
          button.setAttribute('aria-pressed',String(button.dataset.value===state[kind]));
          const blocked=kind==='effects'&&button.dataset.value!=='none'&&!effectAllowed();
          button.disabled=blocked;button.title=blocked?'언커먼·레어 색깔에 적용할 수 있어요.':catalog[kind].get(button.dataset.value).name;
        });
        const row=picker.querySelector('.cl-owned');
        if(row){
          const strip=row.querySelector('.cl-owned-items');strip.replaceChildren();
          if(kind==='effects'){
            for(const remaining of data.effects.filter(effect=>effect.id!==state.effects)){const name=make('span','cl-owned-effect');name.textContent=remaining.name;strip.append(name);}
          }else{
            data[kind].filter(other=>other.id!==state[kind]).forEach(other=>strip.append(glyph(kind,other)));
          }
          fitOwned(row);
        }
      });
      const options=example.querySelector('.cl-color-options');
      options.hidden=!effectAllowed()||color.a===color.b;
      options.querySelector('.cl-color-name').textContent=color.name;
      options.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
      options.querySelectorAll('[data-angle]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.angle===state.angle)));
      const badge=example.querySelector('[data-preview] [data-nickname-badge]'),visual=badge.querySelector('.badge-visual');
      visual.querySelectorAll('.custom-badge-effect').forEach(effect=>visible.unobserve(effect));
      visual.replaceChildren(root.querySelector(`[data-comparison-icon="${state.icons}"]`).content.cloneNode(true));
      visual.querySelector('img').style.opacity='0';
      const mask=`url("${catalog.icons.get(state.icons).src}")`,base=make('span','custom-badge-base');
      base.style.maskImage=mask;base.style.webkitMaskImage=mask;
      base.style.background=`linear-gradient(${state.angle},${color.a} ${state.mode==='split'?'50%':'15%'},${color.b} ${state.mode==='split'?'50%':'85%'})`;
      visual.append(base);
      if(state.effects!=='none'){
        const overlay=make('span','custom-badge-effect effect-'+state.effects);overlay.style.maskImage=mask;overlay.style.webkitMaskImage=mask;
        visual.append(overlay);visible.observe(overlay);
      }
      const selected=[catalog.icons.get(state.icons).name,color.name,state.effects==='none'?null:catalog.effects.get(state.effects).name].filter(Boolean).join(' · ');
      example.querySelector('.cl-selection-name').textContent=selected;
      visual.setAttribute('aria-label',selected);
      badge.dispatchEvent(new CustomEvent('nickname-badge:change',{bubbles:true}));
    }
    example.querySelectorAll('.cl-picker').forEach(picker=>{
      picker.querySelectorAll('[data-value]').forEach(button=>button.addEventListener('click',()=>{state[picker.dataset.kind]=button.dataset.value;render();}));
    });
    example.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;render();}));
    example.querySelectorAll('[data-angle]').forEach(button=>button.addEventListener('click',()=>{state.angle=button.dataset.angle;render();}));
    render();
  });
  initNicknameBadges();
  document.addEventListener('visibilitychange',()=>root.classList.toggle('page-hidden',document.hidden));
}
