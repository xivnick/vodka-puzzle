import {badgeEffectTextures} from '../data/badge-effect-textures.js';
import './badge-effect-clock.js';

export function badgeEffectRenderer(){
  return typeof location!=='undefined'&&new URLSearchParams(location.search).get('renderer')==='png'?'png':'css';
}

// The icon mask and base color stay fixed. Only white light layers animate.
export function createBadgeEffect(effect,{renderer=badgeEffectRenderer()}={}){
  if(!Object.hasOwn(badgeEffectTextures,effect))throw new RangeError('Unknown badge effect');
  if(!['css','png'].includes(renderer))throw new RangeError('Unknown badge renderer');
  const overlay=document.createElement('span');
  overlay.className='custom-badge-effect effect-'+effect+' is-offscreen';
  overlay.dataset.badgeEffect=effect;overlay.dataset.effectRenderer=renderer;overlay.setAttribute('aria-hidden','true');
  if(renderer==='png'){
    const item=badgeEffectTextures[effect];
    overlay.style.backgroundImage=`url('${item.src}')`;
    overlay.style.backgroundSize=`${item.columns*100}% ${item.rows*100}%`;
    return overlay;
  }
  const count={ribbon:1,foil:18,interference:9,lenticular:12,afterglow:1}[effect];
  for(let i=0;i<count;i++){
    const light=document.createElement('span');light.className='badge-light';
    if(effect==='foil'){
      light.style.left=`${Math.floor(i/2)%3*100/3}%`;light.style.top=`${Math.floor(i/6)*100/3}%`;
      light.style.clipPath=i%2?'polygon(0 0,100% 0,100% 100%)':'polygon(0 0,0 100%,100% 100%)';
      light.style.animationDelay=`-${(i*7%18)*5.2/18}s`;
    }
    if(effect==='lenticular'){
      light.style.left=`${i*100/12}%`;light.style.animationDelay=`-${i*.12}s`;
    }
    if(effect==='interference'){
      // Static radial basis images add to the original nine-stop gradient.
      // Only layer opacity changes; the gradient itself is never animated.
      const stops=i===0?'white 0%,transparent 12.5%':i===8?'transparent 87.5%,white 100%':`transparent ${(i-1)*12.5}%,white ${i*12.5}%,transparent ${(i+1)*12.5}%`;
      light.style.backgroundImage=`radial-gradient(ellipse 90% 90% at 30% 35%,${stops})`;
      light.style.animationName=`badge-css-interference-${i}`;
    }
    overlay.append(light);
  }
  return overlay;
}
export function cloneBadgeVisual(node){
  if(node.nodeType===1&&node.classList.contains('custom-badge-effect')){
    const copy=createBadgeEffect(node.dataset.badgeEffect,{renderer:node.dataset.effectRenderer});copy.style.cssText=node.style.cssText;return copy;
  }
  return node.cloneNode(true);
}
