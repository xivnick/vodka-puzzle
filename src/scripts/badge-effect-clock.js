import {badgeEffectTextures} from '../data/badge-effect-textures.js';

// One page timer and at most one frame update per visible effect type, not badge.
export function createSharedEffectClock(writeFrame,clock=globalThis,now=()=>performance.now()){
  let active=new Set(),timer=null;
  const previous=new Map();
  function render(){
    const time=now();
    for(const effect of active){
      const item=badgeEffectTextures[effect],frame=Math.floor(time/50)%item.frames;
      if(previous.get(effect)!==frame){writeFrame(effect,frame,(frame%item.columns)/(item.columns-1)*100,Math.floor(frame/item.columns)/(item.rows-1)*100);previous.set(effect,frame);}
    }
  }
  function tick(){timer=null;if(!active.size)return;render();timer=clock.setTimeout(tick,50);}
  function setActive(effects){
    active=new Set([...effects].filter(effect=>Object.hasOwn(badgeEffectTextures,effect)));
    if(!active.size){if(timer!==null)clock.clearTimeout(timer);timer=null;return;}
    if(timer===null)tick();else render();
  }
  return {setActive,stop:()=>setActive([])};
}

export function activeBadgeEffectTypes(elements,disabled=false){
  const active=new Set();
  if(disabled)return active;
  for(const element of elements)if(element.isConnected&&!element.classList.contains('is-offscreen')&&!element.classList.contains('is-paused')&&!element.closest('.effects-paused,.page-hidden'))active.add(element.dataset.badgeEffect);
  return active;
}

function initialize(){
  const sheetElement=document.createElement('style');sheetElement.dataset.badgeEffectClock='';document.head.append(sheetElement);
  const rules=new Map();
  for(const effect of Object.keys(badgeEffectTextures)){
    const index=sheetElement.sheet.insertRule(`.custom-badge-effect.effect-${effect}{background-position:0 0%}`,sheetElement.sheet.cssRules.length);
    rules.set(effect,sheetElement.sheet.cssRules[index]);
  }
  const ticker=createSharedEffectClock((effect,frame,x,y)=>{rules.get(effect).style.backgroundPosition=`${x}% ${y}%`;});
  const observed=new Set(),visible=new Set(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  function refresh(){
    for(const element of observed)if(!element.isConnected){intersection.unobserve(element);observed.delete(element);visible.delete(element);}
    ticker.setActive(activeBadgeEffectTypes(visible,document.hidden||motion.matches));
  }
  const intersection=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!observed.has(entry.target))continue;
      if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);
      entry.target.classList.toggle('is-offscreen',!entry.isIntersecting);
    }
    refresh();
  });
  function observe(element){if(observed.has(element))return;observed.add(element);intersection.observe(element);}
  new MutationObserver(records=>{
    for(const record of records)if(record.type==='childList')for(const node of record.addedNodes){
      if(node.nodeType!==1)continue;
      if(node.matches('.custom-badge-effect'))observe(node);
      node.querySelectorAll('.custom-badge-effect').forEach(observe);
    }
    if(records.some(record=>record.type==='childList'||record.target.matches('.custom-badge-effect,.mypage-v2')))refresh();
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',refresh);motion.addEventListener('change',refresh);
  window.addEventListener('pagehide',()=>ticker.stop());window.addEventListener('pageshow',refresh);
  return {observe};
}

if(typeof window!=='undefined'&&typeof IntersectionObserver==='function'){
  const observer=initialize();
  document.querySelectorAll('.custom-badge-effect').forEach(observer.observe);
}
