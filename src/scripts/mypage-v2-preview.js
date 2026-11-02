import {initNicknameBadges} from './nickname-badge-alignment.js';
const root=document.querySelector('.mypage-v2');
if(root){
  const data=JSON.parse(root.querySelector('#mypagePreviewData').textContent);
  const $=s=>root.querySelector(s);
  const all=s=>[...root.querySelectorAll(s)];
  const icons=new Map(data.icons.map(i=>[i.id,i]));
  const colors=new Map([...data.common,...data.rare].map(c=>[c.id,c]));
  const base={id:'base',name:'기본색',a:'#444444',b:'#444444',rarity:'base'};
  colors.set('base',base);
  colors.set('u-start',{id:'u-start',name:'비취 · 갈색',a:'#42977D',b:'#8F6A50',rarity:'uncommon'});
  const inventory=new Map([['c0',3],['c6',3],['c15',3],['c25',3],['c30',3],['u-start',1],['r-berry',1]]);
  const ownedIcons=new Set(['leaf','puzzle','flame','sword','rabbit']);
  const ownedEffects=new Set(['ribbon','afterglow']);
  const effects=new Map(data.effects.map(e=>[e.id,e]));
  effects.set('sparkle',{id:'sparkle',name:'별빛 반짝임',rarity:'special'});
  let coins=1240,filter='all',drawNumber=0,toastTimer,craft=[];
  let draft={icon:'leaf',color:'base',effect:'none',mode:'gradient',angle:'135deg'};
  let applied={...draft};
  const rarityNames={base:'기본',common:'커먼',uncommon:'언커먼',rare:'레어',epic:'에픽',special:'특수'};
  const visible=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('is-offscreen',!e.isIntersecting)));
  const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
  const pressed=(selector,current)=>all(selector).forEach(e=>e.setAttribute('aria-pressed',String(current(e))));
  const toast=message=>{clearTimeout(toastTimer);$('#previewToast').textContent=message;$('#previewToast').hidden=false;toastTimer=setTimeout(()=>$('#previewToast').hidden=true,2600);};
  const goal=m=>m.stages.find(s=>!m.claimed.includes(s.at));
  const effectAllowed=()=>['uncommon','rare'].includes(colors.get(draft.color).rarity);
  function openTab(id){
    all('[data-tab]').forEach(b=>{const selected=b.dataset.tab===id;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    ['missions','draw','dress'].forEach(k=>$('#panel-'+k).hidden=k!==id);
    if(id==='dress')renderDress();
  }
  function wardrobe(id){
    all('[data-wardrobe]').forEach(b=>{const selected=b.dataset.wardrobe===id;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    ['icons','colors','effects'].forEach(k=>$('#wardrobe-'+k).hidden=k!==id);
  }
  function keyboardTabs(selector,attribute,callback){
    const buttons=all(selector);
    buttons.forEach((b,index)=>b.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%buttons.length;
      if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=buttons.length-1;
      if(next===undefined)return;
      event.preventDefault();callback(buttons[next].dataset[attribute]);buttons[next].focus();
    }));
  }
  all('[data-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.tab)));
  all('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.openTab)));
  all('[data-wardrobe]').forEach(b=>b.addEventListener('click',()=>wardrobe(b.dataset.wardrobe)));
  keyboardTabs('[data-tab]','tab',openTab);keyboardTabs('[data-wardrobe]','wardrobe',wardrobe);
  $('#resetDemo').addEventListener('click',()=>location.reload());
  function coinAmount(amount){
    const formatted=amount.toLocaleString('ko-KR'),wrapper=make('span','coin-amount');
    wrapper.setAttribute('aria-label',`${formatted} 코인`);
    wrapper.append($('#coinIconTemplate').content.cloneNode(true),make('span','',formatted));
    return wrapper;
  }
  function renderCoins(){
    $('#coinBalance').textContent=coins.toLocaleString('ko-KR');
    $('#coinBalance').closest('.coin-amount').setAttribute('aria-label',`${coins.toLocaleString('ko-KR')} 코인`);
    all('[data-draw]').forEach(b=>b.disabled=coins<Number(b.dataset.draw)*100);
  }
  function renderMissions(){
    let readyCount=0,shown=0;
    data.missions.forEach(m=>{
      const row=$(`[data-mission="${m.id}"]`),s=goal(m),ready=Boolean(s&&m.count>=s.at);
      if(ready)readyCount++;
      row.hidden=filter==='ready'?!ready:filter!=='all'&&m.group!==filter;
      if(!row.hidden)shown++;
      row.classList.toggle('is-complete',!s);
      row.querySelector('.mission-value').textContent=s?`${m.count} / ${s.at}`:'완료';
      const bar=row.querySelector('.mission-progress');
      bar.setAttribute('aria-valuemax',s?.at??1);bar.setAttribute('aria-valuenow',Math.min(m.count,s?.at??1));
      bar.firstElementChild.style.width=(s?Math.min(m.count/s.at,1)*100:100)+'%';
      const reward=row.querySelector('.mission-reward');
      if(s?.kind==='coins')reward.replaceChildren(coinAmount(s.value));
      else reward.textContent=s?(s.kind==='effect'?'별빛 반짝임 효과':`${icons.get(s.value).name} 아이콘`):m.id==='all'?'별빛 반짝임 획득 완료':'아이콘 획득 완료';
      const button=row.querySelector('[data-claim]');button.disabled=!ready;button.classList.toggle('claim-ready',ready);button.textContent=ready?'받기':s?'진행 중':'획득 완료';
    });
    $('#readyCount').textContent=String(readyCount);$('#readyCount').hidden=!readyCount;
    $('#ownedCount').textContent=String(ownedIcons.size);$('#emptyMissions').hidden=shown>0;
    all('[data-select-icon]').forEach(b=>{
      const owned=ownedIcons.has(b.dataset.selectIcon);b.disabled=!owned;b.classList.toggle('locked',!owned);
      b.querySelector('small').textContent=owned?'보유':icons.get(b.dataset.selectIcon).mission;
    });
  }
  all('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;pressed('[data-filter]',x=>x===b);renderMissions();}));
  all('[data-claim]').forEach(b=>b.addEventListener('click',()=>{
    const m=data.missions.find(m=>m.id===b.dataset.claim),s=goal(m);
    if(!s||m.count<s.at||m.claimed.includes(s.at))return;
    m.claimed.push(s.at);
    if(s.kind==='coins'){coins+=s.value;toast(`${s.value} 코인을 받았어요.`);}
    if(s.kind==='icon'){ownedIcons.add(s.value);toast(`${icons.get(s.value).name} 아이콘을 받았어요.`);}
    if(s.kind==='effect'){ownedEffects.add(s.value);toast('별빛 반짝임을 받았어요.');}
    renderCoins();renderMissions();renderDress();
  }));
  function renderResults(items){
    $('#resultItems').replaceChildren();
    items.forEach(item=>{
      const card=make('div','result-item is-'+item.rarity),dot=make('i','result-dot');
      dot.style.background=item.a?`linear-gradient(135deg,${item.a},${item.b})`:'linear-gradient(135deg,#8b7b9c,#ddd1e7,#8b7b9c)';
      const text=make('div');text.append(make('b','',item.name),make('small','',rarityNames[item.rarity]+(item.rarity==='epic'?' · 효과':' · 색상')));card.append(dot,text);$('#resultItems').append(card);
    });
    $('#drawResult').hidden=false;
  }
  all('[data-draw]').forEach(b=>b.addEventListener('click',()=>{
    const count=Number(b.dataset.draw),cost=count*100;if(coins<cost)return;
    coins-=cost;
    const items=Array.from({length:count},()=>{
      const kind=['common','common','rare','common','epic'][drawNumber++%5];
      const pool=kind==='epic'?data.effects:kind==='rare'?data.rare:data.common;
      const item=pool[Math.floor(Math.random()*pool.length)];
      if(kind==='epic')ownedEffects.add(item.id);else inventory.set(item.id,(inventory.get(item.id)||0)+1);
      return item;
    });
    renderCoins();renderResults(items);renderInventory();renderEffects();
    toast(count===1?`${items[0].name} 획득!`:`${count}개 색상과 효과를 받았어요.`);
  }));
  function renderBadge(container,state){
    const badge=container.querySelector('[data-nickname-badge]'),visual=badge.querySelector('.badge-visual');
    visual.querySelectorAll('.custom-badge-effect').forEach(e=>visible.unobserve(e));
    const template=$(`[data-icon-template="${state.icon}"]`);
    visual.replaceChildren(template.content.cloneNode(true));
    badge.dispatchEvent(new CustomEvent('nickname-badge:change',{bubbles:true}));
    const svg=visual.querySelector('svg'),img=visual.querySelector('img');
    let mask;
    if(svg){
      svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
      mask=`url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}")`;
      svg.style.opacity='0';
    }else{mask=`url("${img.getAttribute('src')}")`;img.style.opacity='0';}
    const color=colors.get(state.color),layer=make('span','custom-badge-base');
    layer.style.maskImage=mask;layer.style.webkitMaskImage=mask;
    layer.style.background=`linear-gradient(${state.angle},${color.a} ${state.mode==='split'?'50%':'15%'},${color.b} ${state.mode==='split'?'50%':'85%'})`;
    layer.setAttribute('aria-hidden','true');visual.append(layer);
    if(state.effect!=='none'&&ownedEffects.has(state.effect)&&['uncommon','rare'].includes(color.rarity)){
      const overlay=make('span','custom-badge-effect effect-'+state.effect);overlay.style.maskImage=mask;overlay.style.webkitMaskImage=mask;overlay.setAttribute('aria-hidden','true');visual.append(overlay);visible.observe(overlay);
    }
  }
  function renderDress(){
    if(!effectAllowed())draft.effect='none';
    renderBadge($('#profileBadge'),applied);renderBadge($('#dressBadge'),draft);
    pressed('[data-select-icon]',b=>b.dataset.selectIcon===draft.icon);
    $('#selectionLabel').textContent=[icons.get(draft.icon).name,colors.get(draft.color).name,draft.effect==='none'?null:effects.get(draft.effect)?.name].filter(Boolean).join(' · ');
    renderInventory();renderEffects();
    $('#saveStatus').textContent=JSON.stringify(draft)===JSON.stringify(applied)?'지금 사용 중인 배지예요.':'선택한 조합을 미리보고 있어요.';
  }
  all('[data-select-icon]').forEach(b=>b.addEventListener('click',()=>{
    if(!ownedIcons.has(b.dataset.selectIcon))return;
    draft.icon=b.dataset.selectIcon;renderDress();
  }));
  function renderInventory(){
    const panel=$('#colorInventory');panel.replaceChildren();
    [base,...[...inventory.keys()].map(id=>colors.get(id))].forEach(color=>{
      const b=make('button','color-item');b.type='button';b.dataset.selectColor=color.id;b.setAttribute('aria-pressed',String(draft.color===color.id));
      const swatch=make('i');swatch.style.background=`linear-gradient(135deg,${color.a},${color.b})`;
      b.append(swatch,make('b','',color.name),make('small','',color.id==='base'?'기본색':`${rarityNames[color.rarity]} · ${inventory.get(color.id)}개`));
      b.addEventListener('click',()=>{draft.color=color.id;renderDress();});panel.append(b);
    });
  }
  function renderEffects(){
    const panel=$('#effectInventory');panel.replaceChildren();
    [{id:'none',name:'효과 없음'},...effects.values()].forEach(effect=>{
      const owned=effect.id==='none'||ownedEffects.has(effect.id),allowed=effect.id==='none'||effectAllowed();
      const b=make('button','effect-item');b.type='button';b.dataset.selectEffect=effect.id;b.disabled=!owned||!allowed;b.setAttribute('aria-pressed',String(draft.effect===effect.id));
      b.append(make('i','effect-mark'),make('span','',effect.name),make('small','',effect.id==='none'?'':!owned?(effect.id==='sparkle'?'완전 정복 보상':'미보유'):!allowed?'색 조합 필요':'보유'));
      b.addEventListener('click',()=>{draft.effect=effect.id;renderDress();});panel.append(b);
    });
    $('#effectHint').textContent=effectAllowed()?'보유한 효과를 선택해보세요.':'커먼 색상에는 효과를 입힐 수 없어요. 색을 조합해 언커먼으로 만들어보세요.';
  }
  all('[data-style]').forEach(b=>b.addEventListener('click',()=>{draft.mode=b.dataset.style;pressed('[data-style]',x=>x===b);renderDress();}));
  all('[data-angle]').forEach(b=>b.addEventListener('click',()=>{draft.angle=b.dataset.angle;pressed('[data-angle]',x=>x===b);renderDress();}));
  $('#saveStyle').addEventListener('click',()=>{applied={...draft};renderDress();toast('대표 배지에 적용했어요.');});
  $('#resetStyle').addEventListener('click',()=>{draft={icon:'leaf',color:'base',effect:'none',mode:'gradient',angle:'135deg'};pressed('[data-style]',b=>b.dataset.style==='gradient');pressed('[data-angle]',b=>b.dataset.angle==='135deg');renderDress();});
  function craftResult(){
    const unique=[...new Set(craft)];if(craft.length!==3)return null;
    const a=colors.get(unique[0]),b=colors.get(unique[1]||unique[0]);
    return {id:'u-'+[a.id,b.id].sort().join('-'),name:a.id===b.id?a.name:`${a.name} · ${b.name}`,a:a.a,b:b.a,rarity:'uncommon'};
  }
  function renderCraft(){
    $('#craftSlots').replaceChildren();
    for(let index=0;index<3;index++){
      const slot=make('button','craft-slot');slot.type='button';const color=colors.get(craft[index]);
      slot.setAttribute('aria-label',color?`${index+1}번 재료 ${color.name} 빼기`:`${index+1}번 빈 재료`);
      if(color)slot.style.background=color.a;
      slot.addEventListener('click',()=>{if(index<craft.length){craft.splice(index,1);renderCraft();}});$('#craftSlots').append(slot);
    }
    $('#craftChoices').replaceChildren();
    [...inventory.entries()].filter(([id])=>colors.get(id).rarity==='common').forEach(([id,quantity])=>{
      const color=colors.get(id),left=quantity-craft.filter(c=>c===id).length,b=make('button','craft-choice');b.type='button';b.dataset.craftColor=id;b.disabled=left<=0||craft.length>=3;
      const dot=make('i');dot.style.background=color.a;b.append(dot,make('span','',color.name),make('small','',`${left}개`));b.addEventListener('click',()=>{craft.push(id);renderCraft();});$('#craftChoices').append(b);
    });
    const result=craftResult();$('#craftOutcome').textContent=result?`${result.name} · 언커먼`:'세 가지 색을 선택해주세요.';$('#craftConfirm').disabled=!result;
  }
  $('#openCraft').addEventListener('click',()=>{craft=[];renderCraft();$('#craftDialog').showModal();});
  $('#closeCraft').addEventListener('click',()=>$('#craftDialog').close());
  $('#craftConfirm').addEventListener('click',()=>{
    const result=craftResult();if(!result)return;
    const needed=new Map();craft.forEach(id=>needed.set(id,(needed.get(id)||0)+1));
    if([...needed].some(([id,n])=>(inventory.get(id)||0)<n))return;
    needed.forEach((n,id)=>{const left=inventory.get(id)-n;if(left)inventory.set(id,left);else inventory.delete(id);});
    colors.set(result.id,result);inventory.set(result.id,(inventory.get(result.id)||0)+1);draft.color=result.id;
    $('#craftDialog').close();renderDress();toast(`${result.name} 언커먼을 만들었어요.`);
  });
  document.addEventListener('visibilitychange',()=>root.classList.toggle('page-hidden',document.hidden));
  initNicknameBadges();renderCoins();renderMissions();renderDress();
  document.fonts.ready.then(()=>{renderBadge($('#profileBadge'),applied);renderBadge($('#dressBadge'),draft);});
}
