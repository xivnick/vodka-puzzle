// One tooltip per ranking, positioned only on interaction; no animation timer.
const initialized=new WeakSet();let sequence=0;
export function initBadgeMissionTooltips(root){
 if(initialized.has(root))return;initialized.add(root);
 const samples=[...root.querySelectorAll('[data-badge-mission]')];
 if(!samples.length)return;
 const tooltip=document.createElement('div');tooltip.className='badge-mission-tooltip';tooltip.id=`badge-mission-tooltip-${++sequence}`;tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
 let active=null,pinned=false;
 function hide(){
  active?.removeAttribute('aria-describedby');active=null;pinned=false;tooltip.hidden=true;
 }
 function show(trigger,name,pin=false){
  active?.removeAttribute('aria-describedby');active=trigger;pinned=pin;
  tooltip.textContent=name;tooltip.hidden=false;trigger.setAttribute('aria-describedby',tooltip.id);
  const anchor=trigger.getBoundingClientRect(),bounds=tooltip.getBoundingClientRect();
  const left=Math.max(8,Math.min(anchor.left+anchor.width/2-bounds.width/2,window.innerWidth-bounds.width-8));
  const above=anchor.top-bounds.height-8;
  tooltip.dataset.side=above>=8?'above':'below';
  tooltip.style.setProperty('--badge-arrow-x',`${anchor.left+anchor.width/2-left}px`);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${above>=8?above:anchor.bottom+8}px`;
 }
 for(const sample of samples){
  const trigger=sample.querySelector('.badge-visual'),name=sample.dataset.badgeMission;if(!trigger||!name)continue;
  trigger.classList.add('badge-mission-trigger');trigger.setAttribute('role','button');trigger.setAttribute('tabindex','0');trigger.setAttribute('aria-label',name);
  const toggle=()=>{if(active===trigger&&pinned)hide();else show(trigger,name,true);};
  trigger.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')show(trigger,name,active===trigger&&pinned);});
  trigger.addEventListener('pointerleave',()=>{if(active===trigger&&!pinned&&document.activeElement!==trigger)hide();});
  trigger.addEventListener('click',toggle);
  trigger.addEventListener('focus',()=>show(trigger,name));
  trigger.addEventListener('blur',()=>{if(active===trigger)hide();});
  trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
 }
 document.addEventListener('pointerdown',event=>{if(active&&!active.contains(event.target)&&!tooltip.contains(event.target))hide();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
 window.addEventListener('scroll',hide,{capture:true,passive:true});window.addEventListener('resize',hide);
}
