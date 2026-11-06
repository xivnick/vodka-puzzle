import {createBadgeEffect} from './nickname-badge-effects.js';
import {initNicknameBadges} from './nickname-badge-alignment.js';
import {initBadgeMissionTooltips} from './badge-mission-tooltip.js';
import '../styles/cosmetic-ranking.css';
import '../styles/nickname-badge-effects.css';
import '../styles/badge-mission-tooltip.css';
const sources=import.meta.glob('../../public/icons/**/*.svg',{query:'?raw',import:'default'});
const cache=new Map(),pending=new Map();
const visibility=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-offscreen',!entry.isIntersecting)));
const make=(tag,className)=>{const e=document.createElement(tag);e.className=className;return e;};
async function displays(names){
 const missing=names.filter(name=>!pending.has(name)&&(!cache.has(name)||cache.get(name).until<Date.now()));
 for(let i=0;i<missing.length;i+=200){
  const group=missing.slice(i,i+200),request=window.sbPublicRpc('cosmetic_rank_displays',{requested_season:document.documentElement.dataset.season,nicknames:group});
  for(const name of group){const value=request.then(result=>{const display=result[name]??null;cache.set(name,{value:display,until:Date.now()+30000});return display;}).finally(()=>pending.delete(name));pending.set(name,value);}
 }
 return new Map(await Promise.all(names.map(async name=>[name,pending.has(name)?await pending.get(name):cache.get(name)?.value])));
}
async function paintName(element,display){
 const nickname=element.dataset.cosmeticNickname,signature=JSON.stringify(display);
 if(element.dataset.cosmeticSignature===signature)return;
 if(!display?.icon?.src){if(element.dataset.cosmeticSignature){element.replaceChildren(document.createTextNode(nickname));delete element.dataset.cosmeticSignature;}return;}
 const src=display.icon.src,loader=sources['../../public'+src];
 let svg;
 if(loader){const text=await loader();svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;}
 else if(src!=='/icons/juru-marble/vodka-shot.png')return;
 if(!element.isConnected||element.dataset.cosmeticNickname!==nickname||element.dataset.cosmeticSignature===signature)return;
 const wrapper=make('span','cosmetic-rank-wrapper');wrapper.dataset.badgeMission=display.mission??'';
 const badge=make('span','nickname-badge cosmetic-rank');badge.dataset.nicknameBadge='';badge.style.setProperty('--badge-size','18px');
 const name=make('span','badge-name');name.dataset.badgeName='';name.textContent=nickname;
 const anchor=make('span','badge-anchor'),visual=make('span','badge-visual');
 if(svg)visual.append(svg);else{const img=make('img','');img.src=src;img.alt='';img.width=18;img.height=18;visual.append(img);}
 anchor.append(visual);badge.append(name,anchor);wrapper.append(badge);element.replaceChildren(wrapper);element.dataset.cosmeticSignature=signature;
 initNicknameBadges();
 const mask=svg?`url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}")`:`url("${src}")`;
 visual.firstElementChild.style.opacity='0';
 const color=display.color??{a:'#444444',b:'#444444'},a=display.reversed?color.b:color.a,b=display.reversed?color.a:color.b;
 const angle={diagonal:'135deg',horizontal:'90deg',vertical:'180deg'}[display.direction]??'135deg',split=display.expression==='split';
 const ink=make('span','cosmetic-rank-ink');ink.style.maskImage=mask;ink.style.webkitMaskImage=mask;ink.style.background=`linear-gradient(${angle},${a} ${split?'50%':'15%'},${b} ${split?'50%':'85%'})`;visual.append(ink);
 if(display.effect){const light=createBadgeEffect(display.effect,{renderer:'optimized'});light.style.maskImage=mask;light.style.webkitMaskImage=mask;visual.append(light);visibility.observe(light);}
 if(display.sparkle){const sparkle=make('span','cosmetic-rank-sparkle is-offscreen');visual.append(sparkle);visibility.observe(sparkle);}
}
window.decorateCosmeticRankings=async container=>{
 if(!window.puzzleCosmeticRelease?.active)return;
 const elements=[...container.querySelectorAll('[data-cosmetic-nickname]')];if(!elements.length)return;
 try{const data=await displays([...new Set(elements.map(e=>e.dataset.cosmeticNickname))]);await Promise.all(elements.map(e=>paintName(e,data.get(e.dataset.cosmeticNickname))));initBadgeMissionTooltips(container);}
 catch(error){console.warn('Ranking customization unavailable',error);}
};
window.addEventListener('cosmetic-release-ready',()=>{if(window.puzzleCosmeticRelease.active)void window.decorateCosmeticRankings(document);});
const updateVisibility=()=>document.documentElement.classList.toggle('cosmetic-page-hidden',document.hidden);
document.addEventListener('visibilitychange',updateVisibility);updateVisibility();
void window.puzzleCosmeticReleaseReady?.then(()=>window.decorateCosmeticRankings(document));
