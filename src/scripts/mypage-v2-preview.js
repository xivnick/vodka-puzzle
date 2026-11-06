import {getAchievementGoal as previewGoal,isAchievementThreshold} from '../lib/achievement-goals.js';
import {createBadgeEffect,cloneBadgeVisual} from './nickname-badge-effects.js';
import {initNicknameBadges} from './nickname-badge-alignment.js';
export function initMypage(root,{server=null}={}){
  const goal=mission=>server?mission.serverGoal:previewGoal(mission);
  const storageKey='mypage-v2-demo-v1';
  let saved=server?.snapshot()??null;if(!server)try{saved=JSON.parse(sessionStorage.getItem(storageKey));}catch{}
  const data=JSON.parse(root.querySelector('#mypagePreviewData').textContent);
  if(server){data.missions=saved.missions;data.dailyQuests=saved.dailyQuests;data.total=saved.total;}
  const $=s=>root.querySelector(s);
  const all=s=>[...root.querySelectorAll(s)];
  let serverPending=0;
  const icons=new Map(data.icons.map(i=>[i.id,i]));
  const iconName=id=>id==='none'?'아이콘 없음':icons.get(id).name;
  const featureCounts={...saved?.featureCounts};
  for(const action of saved?.featureActions??[])if(featureCounts[action]===undefined)featureCounts[action]=1;
  const colors=new Map([...data.common,...data.rare].map(c=>[c.id,c]));
  const base={id:'base',name:'기본',a:'#444444',b:'#444444',rarity:'base'};
  colors.set('base',base);
  colors.set('u-start',{id:'u-start',name:'비취 · 갈색',a:'#42977D',b:'#8F6A50',rarity:'uncommon'});
  const inventory=new Map(saved?.inventory??[['c0',3],['c6',3],['c15',3],['c25',3],['c30',3],['u-start',1],['r-berry',1]]);
  const ownedIcons=new Set((saved?.ownedIcons??['leaf','puzzle','flame','sword','rabbit']).map(id=>id==='dice-5'?'clover':id));
  const ownedEffects=new Set(saved?.ownedEffects??['ribbon','afterglow']);
  const effects=new Map(data.effects.map(e=>[e.id,e]));
  const drawHistory=[];
  ownedEffects.delete('sparkle');
  const allClearQuery=server?null:new URLSearchParams(location.search).get('all-clear');
  let allClearCompleted=allClearQuery==='1'?data.total:allClearQuery==='0'?Math.max(0,data.total-1):saved?.allClearCompleted??data.allClear.completed;
  const allClearEligible=()=>data.total>0&&allClearCompleted>=data.total;
  let allClearEnabled=saved?.allClearEnabled??(saved?.applied?.effect==='sparkle');
  let coins=saved?.coins??1240,filter='all',craft=[],craftOpen=false;
  let drawBusy=false,finishDraw=null;
  const activeDraws=new Set();
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  let dailyDate=today(),tickets=saved?.tickets??0;
  const dailyClaimed=new Set((saved?.dailyDate===dailyDate?saved.dailyClaimed??[]:[]).filter(id=>data.dailyQuests.some(q=>q.id===id&&q.complete)));
  let draft={icon:'leaf',color:'base',effect:'none',mode:'gradient',angle:'135deg'};
  let applied=saved?.applied??{...draft};if(applied.icon==='dice-5')applied={...applied,icon:'clover'};draft={...applied};
  if(draft.effect==='sparkle'){draft.effect='none';applied.effect='none';}
  let nickname=saved?.nickname??'퍼즐러';
  for(const color of saved?.colors??[])if(!colors.has(color.id))colors.set(color.id,{...color,name:color.name.replaceAll('깊은 민트','청옥').replaceAll('깊은 청록','석유색')});
  colors.set(base.id,base);
  let migratedRefund=0;
  for(const [id,count] of inventory)if(count>1&&['uncommon','rare'].includes(colors.get(id)?.rarity)){migratedRefund+=(count-1)*100;inventory.set(id,1);}
  for(const [id,count] of saved?.effectCounts??[])if(count>1&&ownedEffects.has(id)&&effects.get(id)?.rarity==='epic')migratedRefund+=(count-1)*500;
  coins+=migratedRefund;

  for(const mission of data.missions){
    if(!server&&saved?.claimed?.[mission.id]&&(!mission.featureAction||saved.featureMissionVersion===2))mission.claimed=saved.claimed[mission.id].filter(at=>isAchievementThreshold(mission,at));
    if(!server&&mission.featureAction)mission.count=featureCounts[mission.featureAction]||0;
  }
  function persist(){if(server)return;try{sessionStorage.setItem(storageKey,JSON.stringify({allClearEnabled,allClearCompleted,coins,featureMissionVersion:2,featureCounts,nickname,applied,tickets,dailyDate,dailyClaimed:[...dailyClaimed],inventory:[...inventory],ownedIcons:[...ownedIcons],ownedEffects:[...ownedEffects],colors:[...colors.values()],claimed:Object.fromEntries(data.missions.map(m=>[m.id,m.claimed]))}));}catch{}}
  const rarityNames={base:'기본',common:'커먼',uncommon:'언커먼',rare:'레어',epic:'에픽',special:'특수'};
  const visible=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('is-offscreen',!e.isIntersecting)));
  const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
  const pressed=(selector,current)=>all(selector).forEach(e=>e.setAttribute('aria-pressed',String(current(e))));
  const toast=message=>window.showToast(message);
  const effectAllowed=()=>['uncommon','rare'].includes(colors.get(draft.color).rarity);
  function trackFeature(action,amount=1){
    if(action==='equip-icon'&&featureCounts[action])return;
    featureCounts[action]=action==='equip-icon'?1:(featureCounts[action]||0)+amount;
    for(const mission of data.missions)if(mission.featureAction===action)mission.count=featureCounts[action];
    renderMissions();
  }
  function setBadgeName(container,nickname){
    const name=container.querySelector('[data-badge-name]');name.textContent=nickname;
    name.closest('[data-nickname-badge]').dispatchEvent(new CustomEvent('nickname-badge:change',{bubbles:true}));
  }
  $('#resetDemo')?.addEventListener('click',()=>{try{sessionStorage.removeItem(storageKey);}catch{}location.reload();});
  function editNickname(open){
    $('#nicknameDisplay').hidden=open;$('#profileNicknameForm').hidden=!open;$('#editAccountNickname').setAttribute('aria-expanded',String(open));
    if(open){$('#accountNickname').value=nickname;$('#accountNickname').setCustomValidity('');$('#accountNickname').focus();$('#accountNickname').select();}
  }
  $('#editAccountNickname').addEventListener('click',()=>editNickname(true));
  $('#accountNickname').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();editNickname(false);$('#editAccountNickname').focus();}});
  $('#profileNicknameForm').addEventListener('submit',async event=>{
    event.preventDefault();const input=$('#accountNickname'),next=input.value.trim();
    if(!next){input.setCustomValidity('닉네임을 입력해주세요.');input.reportValidity();return;}
    if(server){if([...next].length>20||next==='게스트'){input.setCustomValidity('게스트를 제외한 1~20자의 닉네임을 입력해 주세요.');input.reportValidity();return;}await runServer(()=>server.rename(next),()=>{editNickname(false);toast('닉네임을 저장했어요.');});return;}
    nickname=next;$('#accountName').textContent=nickname;editNickname(false);setBadgeName($('#profileBadge'),nickname);renderDress();persist();toast('닉네임을 저장했어요.');
  });
  $('#accountNickname').addEventListener('input',event=>event.target.setCustomValidity(''));
  function coinAmount(amount){
    const formatted=amount.toLocaleString('ko-KR'),wrapper=make('span','coin-amount');
    wrapper.setAttribute('aria-label',`${formatted} 코인`);
    wrapper.append($('#coinIconTemplate').content.cloneNode(true),make('span','',formatted));
    return wrapper;
  }
  function renderCoins(){
    $('#coinBalance').textContent=coins.toLocaleString('ko-KR');
    $('#coinBalance').closest('.coin-amount').setAttribute('aria-label',`${coins.toLocaleString('ko-KR')} 코인`);
    all('[data-draw]').forEach(b=>b.disabled=(drawBusy&&Number(b.dataset.draw)!==1)||coins<Number(b.dataset.draw)*100||(server&&(!server.snapshot().drawAvailable||serverPending>0)));
    $('#ticketBalance').textContent=tickets.toLocaleString('ko-KR');$('#ticketBalanceWrapper').hidden=tickets===0;$('#ticketBalanceWrapper').setAttribute('aria-label',`타임머신 티켓 ${tickets}장`);
  }
  function syncDailyDate(){if(server)return;const current=today();if(current!==dailyDate){dailyDate=current;dailyClaimed.clear();}}
  function renderDailyQuests(){
    syncDailyDate();
    data.dailyQuests.forEach(q=>{
      const row=$(`[data-daily-quest="${q.id}"]`),claimed=dailyClaimed.has(q.id),button=row.querySelector('[data-daily-claim]');
      row.classList.toggle('is-complete',claimed);row.querySelector('h3').textContent=q.name;row.querySelector('[data-daily-state]').textContent=claimed?'완료':q.complete?'1/1':'0/1';
      button.disabled=claimed||!q.complete||q.unavailable||q.configured===false;button.title=q.unavailable?'다른 사용자가 먼저 완료했습니다.':'';button.classList.toggle('claim-ready',!claimed&&q.complete&&!q.unavailable);button.textContent=claimed?'수령 완료':q.unavailable?'기회 종료':q.complete?'받기':'진행 중';
      if(q.unavailable)button.setAttribute('aria-label','기회 종료: 다른 사용자가 먼저 완료했습니다.');else button.removeAttribute('aria-label');
    });
  }
  all('[data-daily-claim]').forEach(button=>button.addEventListener('click',async()=>{
    syncDailyDate();const q=data.dailyQuests.find(q=>q.id===button.dataset.dailyClaim);
    if(!q?.complete||q.unavailable||dailyClaimed.has(q.id))return;
    if(server){await runServer(()=>server.claimDaily(q.id),response=>toastReward(response.reward,response.already_claimed));return;}
    dailyClaimed.add(q.id);
    if(q.kind==='coins'){coins+=q.value;toast(`${q.value} 코인을 받았어요.`);}else{tickets+=q.value;toast(`타임머신 티켓 ${q.value}장을 받았어요.`);}
    renderCoins();renderDailyQuests();persist();
  }));
  // Freeze row order for this page visit; reward claims only update row contents.
  function sortMissionRows(){
    const priority=m=>{const s=goal(m);return !s?2:(server?m.serverState==='claimable':m.count>=s.at)?0:1;};
    const ordered=[...data.missions].sort((a,b)=>priority(a)-priority(b));
    $('#missionList').append(...ordered.map(m=>$(`[data-mission="${m.id}"]`)));
  }
  function renderMissions(){
    let shown=0;
    data.missions.forEach(m=>{
      const row=$(`[data-mission="${m.id}"]`),s=goal(m),ready=Boolean(s&&(server?m.serverState==='claimable'&&m.configured:m.count>=s.at));
      row.hidden=m.active===false||(filter!=='all'&&m.group!==filter);
      if(server){row.querySelector('h3').textContent=m.name;row.querySelector('.mission-condition').textContent=m.text;const icon=row.querySelector('.mission-icon');icon.replaceChildren($(`[data-icon-template="${m.icon}"]`).content.cloneNode(true));}
      if(!row.hidden)shown++;
      row.classList.toggle('is-complete',!s);
      row.querySelector('.mission-value').textContent=s?`${m.repeatEvery?m.count:Math.min(m.count,s.at)} / ${s.at}`:'완료';
      const bar=row.querySelector('.mission-progress');
      bar.setAttribute('aria-valuemax',s?.at??1);bar.setAttribute('aria-valuenow',Math.min(m.count,s?.at??1));
      bar.firstElementChild.style.width=(s?Math.min(m.count/s.at,1)*100:100)+'%';
      const reward=row.querySelector('.mission-reward');
      if(s?.kind==='coins')reward.replaceChildren(coinAmount(s.value));
      else if(s?.kind==='random-coins'){
        const range=make('small','',`${s.options[0]}~${s.options.at(-1)}`),amount=coinAmount('?');
        amount.setAttribute('aria-label',`${s.options[0]}~${s.options.at(-1)}코인 무작위 보상`);const wrapper=make('span','random-coin-reward');wrapper.append(amount,range);reward.replaceChildren(wrapper);
      }else if(s?.kind==='tickets'){
        const amount=make('span','daily-ticket'),icon=make('img');icon.src='/icons/time-machine/ticket.svg';icon.alt='';icon.width=14;icon.height=14;
        amount.setAttribute('aria-label',`타임머신 티켓 ${s.value}장`);amount.append(icon,make('span','',s.value));reward.replaceChildren(amount);
      }
      else reward.textContent=s?(s.kind==='effect'?'별빛 반짝임 효과':`${icons.get(s.value).name} 아이콘`):m.featureAction?'보상 수령 완료':m.id==='all'?'별빛 반짝임 획득 완료':'아이콘 획득 완료';
      const button=row.querySelector('[data-claim]');button.disabled=!ready;button.classList.toggle('claim-ready',ready);button.textContent=ready?'받기':s?'진행 중':'획득 완료';
    });
    $('#emptyMissions').hidden=shown>0;
    all('[data-select-icon]').forEach(b=>{
      const owned=b.dataset.selectIcon==='none'||ownedIcons.has(b.dataset.selectIcon);b.disabled=!owned;b.hidden=!owned;
    });
  }
  all('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;pressed('[data-filter]',x=>x===b);renderMissions();}));
  all('[data-claim]').forEach(b=>b.addEventListener('click',async()=>{
    const m=data.missions.find(m=>m.id===b.dataset.claim),s=goal(m);
    if(server){if(!s||m.serverState!=='claimable'||!m.configured)return;await runServer(()=>server.claim(m),response=>toastReward(response.reward,response.already_claimed));return;}
    if(!s||m.count<s.at||m.claimed.includes(s.at))return;
    m.claimed.push(s.at);
    if(s.kind==='coins'||s.kind==='random-coins'){
      const amount=s.kind==='coins'?s.value:s.options[Math.floor(Math.random()*s.options.length)];coins+=amount;toast(`${amount} 코인을 받았어요.`);
    }
    if(s.kind==='tickets'){tickets+=s.value;toast(`타임머신 티켓 ${s.value}장을 받았어요.`);}
    if(s.kind==='icon'){ownedIcons.add(s.value);toast(`${icons.get(s.value).name} 아이콘을 받았어요.`);}
        renderCoins();renderMissions();renderDress();persist();
  }));
  function renderDrawHistoryStatus(){
    const counts=drawHistory.reduce((result,item)=>{result[item.rarity]=(result[item.rarity]||0)+1;return result;},{});
    $('#drawStatus').textContent=['common','rare','epic'].filter(kind=>counts[kind]).map(kind=>`${rarityNames[kind]} ${counts[kind]}개`).join(' · ');
  }
  function renderResults(items,animate=true){
    if(!items.length)return;
    const panel=$('#resultItems'),timers=[],reveals=[];
    $('#drawResult').hidden=false;
    if(animate){
      panel.setAttribute('aria-busy','true');$('#drawStatus').textContent='열어보는 중…';
    }
    items.forEach(item=>{
      const card=make('div','result-item is-sealed'),cover=make('span','result-cover','?');
      card.setAttribute('aria-hidden','true');card.append(cover);panel.append(card);
      let revealed=false;
      reveals.push(()=>{
        if(revealed)return;revealed=true;
        card.className='result-item '+(animate?'is-revealed ':'')+'is-'+item.rarity;card.removeAttribute('aria-hidden');
        const dot=make('i','result-dot');
        dot.style.background=item.a?`linear-gradient(135deg,${item.a},${item.b})`:'#8b7b9c';
        if(item.rarity==='epic'){
          const overlay=createBadgeEffect(item.id);dot.append(overlay);visible.observe(overlay);
        }
        const text=make('div');text.append(make('b','',item.name),make('small','',rarityNames[item.rarity]+(item.rarity==='epic'?' · 효과':' · 색상')));
        if(item.refund){const refund=make('span','result-refund');refund.append(make('span','','중복'),coinAmount(item.refund));text.append(refund);}
        card.replaceChildren(dot,text);
      });
    });
    if(!animate){reveals.forEach(reveal=>reveal());renderDrawHistoryStatus();return;}
    const complete=()=>{
      if(!activeDraws.has(batch))return;
      timers.forEach(clearTimeout);reveals.forEach(reveal=>reveal());
      activeDraws.delete(batch);drawBusy=activeDraws.size>0;
      if(!drawBusy)finishDraw=null;
      panel.setAttribute('aria-busy',String(drawBusy));
      if(!drawBusy)renderDrawHistoryStatus();
      renderCoins();renderCraft();toast(items.length===1?(items[0].refund?`${items[0].name} 중복 · ${items[0].refund} 코인을 받았어요.`:`${items[0].name} 획득!`):`${items.length}개를 확인했어요.`);
    };
    const batch={complete};activeDraws.add(batch);
    finishDraw=()=>{for(const pending of [...activeDraws])pending.complete();};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){complete();return;}
    let delay=620;
    reveals.forEach((reveal,index)=>{
      timers.push(setTimeout(()=>{reveal();if(index===reveals.length-1)complete();},delay));
      delay+=items[index].rarity==='epic'?360:160;
    });
  }
  function drawRarity(){
    const roll=Math.random();let cumulative=0;
    for(const rate of data.drawRates){cumulative+=rate.probability;if(roll<cumulative)return rate.rarity;}
    return data.drawRates.at(-1).rarity;
  }
  function rollDrawItem(){
    const kind=drawRarity(),pool=kind==='epic'?data.effects:kind==='rare'?data.rare:data.common;
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function grantCosmetic(item){
    const duplicate=item.rarity==='epic'?ownedEffects.has(item.id):['uncommon','rare'].includes(item.rarity)&&(inventory.get(item.id)||0)>0;
    const refund=duplicate?(item.rarity==='epic'?500:100):0;
    if(refund)coins+=refund;
    else if(item.rarity==='epic')ownedEffects.add(item.id);
    else inventory.set(item.id,(inventory.get(item.id)||0)+1);
    return {...item,refund};
  }
  function grantDrawItems(items){
    const results=items.map(grantCosmetic);drawHistory.push(...results);return results;
  }
  all('[data-draw]').forEach(b=>b.addEventListener('click',async()=>{
    const count=Number(b.dataset.draw),cost=count*100;if((drawBusy&&count!==1)||coins<cost)return;
    if(server){await runServer(()=>server.draw(count),response=>{const items=response.results.map(server.resultItem);drawHistory.push(...items);drawBusy=true;renderResults(items);});return;}
    drawBusy=true;
    coins-=cost;
    const items=grantDrawItems(Array.from({length:count},()=>rollDrawItem()));
    trackFeature('draw',count);renderCoins();renderInventory();renderEffects();renderCraft();persist();renderResults(items);
  }));
  function renderBadge(container,state){
    const badge=container.querySelector('[data-nickname-badge]'),visual=badge.querySelector('.badge-visual');
    visual.querySelectorAll('.custom-badge-effect,.badge-sparkle').forEach(e=>visible.unobserve(e));
    badge.querySelector('.badge-anchor').hidden=state.icon==='none';
    if(state.icon==='none'){visual.replaceChildren();badge.dispatchEvent(new CustomEvent('nickname-badge:change',{bubbles:true}));return;}
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
      const overlay=createBadgeEffect(state.effect);overlay.style.maskImage=mask;overlay.style.webkitMaskImage=mask;overlay.setAttribute('aria-hidden','true');visual.append(overlay);visible.observe(overlay);
    }
    if(allClearEligible()&&allClearEnabled){const sparkle=make('span','badge-sparkle');sparkle.setAttribute('aria-hidden','true');visual.append(sparkle);visible.observe(sparkle);}
  }
  function applyDress(){
    if(!effectAllowed())draft.effect='none';
    if(server){const desired={...draft};renderDress();void runServer(()=>server.equip(desired));return;}
    applied={...draft};renderDress();persist();
  }
  function renderDress(){
    if(!effectAllowed())draft.effect='none';
    setBadgeName($('#dressBadge'),nickname);
    renderBadge($('#profileBadge'),applied);renderBadge($('#dressBadge'),draft);
    const iconPreview=$('#equippedIcon'),colorPreview=$('#equippedColor'),equippedColor=colors.get(applied.color);
    iconPreview.querySelectorAll('.custom-badge-effect,.badge-sparkle').forEach(effect=>visible.unobserve(effect));
    iconPreview.replaceChildren(...[...$('#profileBadge .badge-visual').childNodes].map(cloneBadgeVisual));
    iconPreview.querySelectorAll('.custom-badge-effect,.badge-sparkle').forEach(effect=>visible.observe(effect));
    iconPreview.hidden=applied.icon==='none';
    $('#equippedColor').hidden=applied.icon==='none';$('#equippedColorSeparator').hidden=applied.icon==='none';
    iconPreview.setAttribute('aria-label',`현재 아이콘: ${iconName(applied.icon)}`);
    $('#equippedIconName').textContent=iconName(applied.icon);
    colorPreview.textContent=equippedColor.name;
    pressed('[data-select-icon]',b=>b.dataset.selectIcon===draft.icon);
    pressed('[data-style]',b=>b.dataset.style===draft.mode);pressed('[data-angle]',b=>b.dataset.angle===draft.angle);
    $('#selectionLabel').textContent=draft.icon==='none'?'아이콘 없음':[iconName(draft.icon),colors.get(draft.color).name,draft.effect==='none'?null:effects.get(draft.effect)?.name,allClearEligible()&&allClearEnabled?'별빛 반짝임':null].filter(Boolean).join(' · ');
    const color=colors.get(draft.color);
    $('#selectedColorOptions').hidden=!['uncommon','rare'].includes(color.rarity)||color.a===color.b;
    const selectedIcon=$('#selectedIconVisual');selectedIcon.hidden=draft.icon==='none';
    if(draft.icon==='none')selectedIcon.replaceChildren();else selectedIcon.replaceChildren($(`[data-icon-template="${draft.icon}"]`).content.cloneNode(true));
    $('#selectedIconLabel').textContent=iconName(draft.icon);
    $('#selectedIconLabel').title=iconName(draft.icon);
    $('#selectedColorLabel').textContent=color.name;$('#selectedColorLabel').title=color.name;
    $('#selectedColorSwatch').style.background=`linear-gradient(${draft.angle},${color.a} ${draft.mode==='split'?'50%':'15%'},${color.b} ${draft.mode==='split'?'50%':'85%'})`;
    $('#pickerEffectName').textContent=[draft.effect==='none'?null:effects.get(draft.effect).name,allClearEligible()&&allClearEnabled?'별빛 반짝임':null].filter(Boolean).join(' · ')||'효과 없음';
    renderInventory();renderEffects();lockServerControls();
  }
  all('[data-select-icon]').forEach(b=>b.addEventListener('click',()=>{
    if(serverPending)return;const id=b.dataset.selectIcon;if(id!=='none'&&!ownedIcons.has(id))return;
    draft.icon=id;if(id!=='none'&&!server)trackFeature('equip-icon');applyDress();
  }));
  function renderInventory(){
    const panel=$('#colorInventory');panel.replaceChildren();
    [base,...[...inventory.keys()].map(id=>colors.get(id))].forEach(color=>{
      const b=make('button','color-item');b.type='button';b.dataset.selectColor=color.id;b.setAttribute('aria-pressed',String(draft.color===color.id));
      const swatch=make('i');swatch.style.background=`linear-gradient(135deg,${color.a},${color.b})`;
      b.append(swatch,make('b','',color.name),make('small','',color.id==='base'?'기본':`${rarityNames[color.rarity]} · ${inventory.get(color.id)}개`));
      b.addEventListener('click',()=>{if(serverPending)return;draft.color=color.id;applyDress();});panel.append(b);
    });
  }
  function renderEffects(){
    const panel=$('#effectInventory'),owned=[...effects.values()].filter(effect=>ownedEffects.has(effect.id));
    panel.replaceChildren();$('#effectSettings').hidden=owned.length===0&&!allClearEligible();
    if(!owned.length&&!allClearEligible())$('#effectSettings').open=false;
    (owned.length?[{id:'none',name:'효과 없음'},...owned]:[]).forEach(effect=>{
      const allowed=effect.id==='none'||effectAllowed();
      const b=make('button','effect-item');b.type='button';b.dataset.selectEffect=effect.id;b.disabled=!allowed;
      b.title=allowed?effect.name:'언커먼 이상 필요';b.setAttribute('aria-pressed',String(draft.effect===effect.id));
      b.append(make('i','effect-mark'),make('span','',effect.name),make('small','',allowed?'':'언커먼 이상 필요'));
      b.addEventListener('click',()=>{if(serverPending)return;draft.effect=effect.id;applyDress();});panel.append(b);
    });
    if(allClearEligible()){const toggle=make('button','effect-item');toggle.type='button';toggle.dataset.toggleAllClear='';toggle.setAttribute('aria-pressed',String(allClearEnabled));toggle.append(make('span','','별빛 반짝임'),make('small','',allClearEnabled?'켜짐':'꺼짐'));toggle.addEventListener('click',()=>{if(serverPending)return;if(server){void runServer(()=>server.toggleAllClear(!allClearEnabled));return;}allClearEnabled=!allClearEnabled;renderDress();persist();});panel.append(toggle);}
  }
  all('[data-style]').forEach(b=>b.addEventListener('click',()=>{if(serverPending)return;draft.mode=b.dataset.style;pressed('[data-style]',x=>x===b);applyDress();}));
  all('[data-angle]').forEach(b=>b.addEventListener('click',()=>{if(serverPending)return;draft.angle=b.dataset.angle;pressed('[data-angle]',x=>x===b);applyDress();}));
  const craftSize=()=>3;
  function craftMaterials(){
    return [...inventory].filter(([id,count])=>count>0&&colors.get(id)?.rarity==='common').map(([id,quantity])=>({item:colors.get(id),quantity}));
  }
  function craftReady(){
    const selected=craft.filter(Boolean);if(selected.length!==craftSize())return false;
    const available=new Map(craftMaterials().map(({item,quantity})=>[item.id,quantity])),needed=new Map();
    selected.forEach(id=>needed.set(id,(needed.get(id)||0)+1));
    return [...needed].every(([id,count])=>(available.get(id)||0)>=count);
  }
  function rollCraftResult(){
    if(!craftReady())return null;
    const candidates=[...new Set(craft.filter(Boolean))];
    let pair;
    if(candidates.length===3){
      const [first]=candidates.splice(Math.floor(Math.random()*candidates.length),1);
      pair=[first,candidates[Math.floor(Math.random()*candidates.length)]];
    }else pair=[candidates[0],candidates[1]??candidates[0]];
    const [a,b]=pair.sort().map(id=>colors.get(id));
    return {id:'u-'+[a.id,b.id].join('-'),name:a.id===b.id?a.name:`${a.name} · ${b.name}`,a:a.a,b:b.a,rarity:'uncommon'};
  }
  function closeCraftSelector(){
    craftOpen=false;renderCraft();
    const target=craftReady()?$('#craftConfirm'):$('#craftSlots').querySelector('[aria-expanded]');target?.focus({preventScroll:true});
  }
  function renderCraft(){
    $('#craftSlots').replaceChildren();
    for(let index=0;index<craftSize();index++){
      const slot=make('button','craft-slot'),item=colors.get(craft[index]);
      slot.type='button';slot.dataset.craftSlot=String(index);slot.disabled=drawBusy||serverPending>0;
      slot.setAttribute('aria-label',item?`${index+1}번 재료 ${item.name} 빼기`:'재료 선택');slot.setAttribute('aria-controls','craftSelector');
      if(!item)slot.setAttribute('aria-expanded',String(craftOpen));
      slot.title=item?`${item.name} 빼기`:'재료 선택';
      if(item?.a)slot.style.background=`linear-gradient(135deg,${item.a},${item.b})`;
      else slot.textContent='+';
      slot.addEventListener('click',()=>{if(drawBusy)return;if(item)craft.splice(index,1);craftOpen=true;renderCraft();});$('#craftSlots').append(slot);
    }
    const selector=$('#craftSelector');selector.dataset.open=String(craftOpen);selector.inert=!craftOpen;selector.setAttribute('aria-hidden',String(!craftOpen));
    $('#craftChoices').replaceChildren();
    const materials=craftMaterials();$('#emptyCraftChoices').hidden=materials.length>0;
    $('#emptyCraftChoices').textContent='선택할 색깔이 없습니다.';
    materials.forEach(({item,quantity})=>{
      const selected=craft.filter(id=>id===item.id).length,left=quantity-selected,button=make('button','craft-choice');
      button.type='button';button.dataset.craftMaterial=item.id;button.disabled=left<=0||craft.length>=craftSize()||drawBusy||serverPending>0;
      button.setAttribute('aria-label',`${item.name} 추가, 남은 수량 ${left}개`);
      const dot=make('i','');dot.style.background=`linear-gradient(135deg,${item.a},${item.b})`;
      button.append(dot,make('span','',item.name),make('small','',selected?`${selected}개 선택 · ${left}개 남음`:`${left}개`));
      button.addEventListener('click',()=>{
        if(drawBusy||craft.length>=craftSize()||left<=0)return;
        craft.push(item.id);if(craft.length===craftSize())craftOpen=false;renderCraft();
        const target=craftReady()?$('#craftConfirm'):$('#craftChoices').querySelector(`[data-craft-material="${item.id}"]:not(:disabled)`);
        target?.focus({preventScroll:true});
      });$('#craftChoices').append(button);
    });
    $('#craftConfirm').disabled=drawBusy||!craftReady();
  }
  $('#closeCraftSelector').addEventListener('click',closeCraftSelector);
  function appendCraftResult(item){
    const card=make('div','result-item is-revealed is-uncommon'),dot=make('i','result-dot'),text=make('div');
    dot.style.background=`linear-gradient(135deg,${item.a},${item.b})`;
    text.append(make('b','',item.name),make('small','','언커먼 · 색상'));
    if(item.refund){const refund=make('span','result-refund');refund.append(make('span','','중복'),coinAmount(item.refund));text.append(refund);}
    card.append(dot,text);$('#craftResultItems').append(card);$('#craftResult').hidden=false;
  }
  $('#craftConfirm').addEventListener('click',async()=>{
    if(drawBusy||!craftReady())return;
    if(server){const materials=[...craft];await runServer(()=>server.craft(materials),response=>{craft=[];craftOpen=false;const result=server.resultItem(response.results[0]);appendCraftResult(result);toast(result.refund?`${result.name} 중복 · ${result.refund} 코인을 받았어요.`:`${result.name} 언커먼을 만들었어요.`);renderCraft();});return;}
    const result=rollCraftResult(),needed=new Map();craft.filter(Boolean).forEach(id=>needed.set(id,(needed.get(id)||0)+1));
    needed.forEach((count,id)=>{const left=inventory.get(id)-count;if(left)inventory.set(id,left);else inventory.delete(id);});
    colors.set(result.id,result);const awarded=grantCosmetic(result);draft.color=result.id;
    craft=[];craftOpen=false;trackFeature('craft');renderCoins();applyDress();renderCraft();appendCraftResult(awarded);
    toast(awarded.refund?`${result.name} 중복 · ${awarded.refund} 코인을 받았어요.`:`${result.name} 언커먼을 만들었어요.`);
  });
  function toastReward(reward,already){
    if(already){toast('이미 받은 보상입니다.');return;}
    if(reward?.coins!=null)toast(`${reward.coins} 코인을 받았어요.`);
    else if(reward?.tickets!=null)toast(`타임머신 티켓 ${reward.tickets}장을 받았어요.`);
    else if(reward?.item_id)toast(`${icons.get(reward.item_id.replace('icon:',''))?.name??'새'} 아이콘을 받았어요.`);
  }
  function syncServer(){
    const state=server.snapshot();coins=state.coins;tickets=state.tickets;nickname=state.nickname;
    inventory.clear();for(const entry of state.inventory)inventory.set(...entry);
    ownedIcons.clear();for(const id of state.ownedIcons)ownedIcons.add(id);
    ownedEffects.clear();for(const id of state.ownedEffects)ownedEffects.add(id);
    for(const color of state.colors)colors.set(color.id,color);
    data.total=state.total;allClearCompleted=state.allClearCompleted;allClearEnabled=state.allClearEnabled;
    applied={...state.applied};draft={...applied};data.missions=state.missions;data.dailyQuests=state.dailyQuests;
    dailyDate=state.dailyDate;dailyClaimed.clear();for(const id of state.dailyClaimed)dailyClaimed.add(id);
    $('#accountName').textContent=nickname;setBadgeName($('#profileBadge'),nickname);
    const selected=craft.filter(Boolean),needed=new Map();selected.forEach(id=>needed.set(id,(needed.get(id)||0)+1));
    if([...needed].some(([id,count])=>(inventory.get(id)||0)<count))craft=[];
    renderCoins();renderDailyQuests();renderMissions();renderDress();renderCraft();
  }
  function lockServerControls(){
    if(!serverPending)return;
    all('[data-claim],[data-daily-claim],[data-draw],[data-select-icon],[data-select-color],[data-select-effect],[data-style],[data-angle],[data-toggle-all-clear],.craft-slot,.craft-choice,#craftConfirm,#profileNicknameForm button').forEach(button=>button.disabled=true);
  }
  function showRecovered(){for(const entry of server.takeRecovered()){if(entry.name==='draw_cosmetics'){const items=entry.response.results.map(server.resultItem);drawHistory.push(...items);renderResults(items,false);}else if(entry.name==='craft_cosmetic')appendCraftResult(server.resultItem(entry.response.results[0]));}}
  async function runServer(action,done){
    if(serverPending)return;
    serverPending++;lockServerControls();
    try{const response=await action();syncServer();showRecovered();done?.(response);}
    catch(error){toast(server.errorText(error));await server.refresh().catch(()=>{});syncServer();showRecovered();}
    finally{serverPending--;renderCoins();renderDailyQuests();renderMissions();renderDress();renderCraft();$('#profileNicknameForm button').disabled=false;}
  }
  const updatePageVisibility=()=>{root.classList.toggle('page-hidden',document.hidden);if(document.hidden)finishDraw?.();};
  document.addEventListener('visibilitychange',updatePageVisibility);updatePageVisibility();
  $('#accountName').textContent=nickname;$('#accountNickname').value=nickname;setBadgeName($('#profileBadge'),nickname);
  if(server){syncServer();showRecovered();}
  persist();
  initNicknameBadges();renderCoins();renderDailyQuests();sortMissionRows();renderMissions();renderDress();renderCraft();
  if(server){$('#accountName').closest('.profile-identity').querySelector('.account-email').textContent=window.puzzleAccount.user.email??'';window.addEventListener('cosmetic-refresh',()=>{if(!serverPending)void runServer(()=>server.refresh());});}
  document.fonts.ready.then(()=>{renderBadge($('#profileBadge'),applied);renderBadge($('#dressBadge'),draft);});
}
