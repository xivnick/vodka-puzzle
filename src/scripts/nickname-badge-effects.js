import {badgeEffectTextures} from '../data/badge-effect-textures.js';
import './badge-effect-clock.js';

// The expensive SVG light geometry is rendered offline, once per frame/type.
// Every icon shares the same five cached textures and the page's shared clock.
export function createBadgeEffect(effect){
  if(!Object.hasOwn(badgeEffectTextures,effect))throw new RangeError('Unknown badge effect');
  const item=badgeEffectTextures[effect],overlay=document.createElement('span');
  overlay.className='custom-badge-effect effect-'+effect+' is-offscreen';
  overlay.dataset.badgeEffect=effect;overlay.setAttribute('aria-hidden','true');
  overlay.style.backgroundImage=`url('${item.src}')`;
  overlay.style.backgroundSize=`${item.columns*100}% ${item.rows*100}%`;
  return overlay;
}
export function cloneBadgeVisual(node){
  if(node.nodeType===1&&node.classList.contains('custom-badge-effect')){
    const copy=createBadgeEffect(node.dataset.badgeEffect);copy.style.cssText=node.style.cssText;return copy;
  }
  return node.cloneNode(true);
}
