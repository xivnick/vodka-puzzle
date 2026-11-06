// Real PNG frame/alpha checks plus shared-clock scheduling and gallery regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {badgeEffectTextures} from '../src/data/badge-effect-textures.js';
import {EFFECTS,FPS,SIZE,frameSvg,opacity} from './lib/badge-effect-frames.mjs';
import {createSharedEffectClock,activeBadgeEffectTypes} from '../src/scripts/badge-effect-clock.js';
const root=new URL('../',import.meta.url);
let totalBytes=0,decodedBytes=0;
for(const [effect,item] of Object.entries(badgeEffectTextures)){
 assert.equal(item.duration,EFFECTS[effect].duration);assert.equal(item.frames,item.duration*FPS);assert.equal(item.size,SIZE);
 const path=new URL('public'+item.src,root),image=sharp(fs.readFileSync(path)),metadata=await image.metadata();
 assert.equal(metadata.width,SIZE*item.columns);assert.equal(metadata.height,SIZE*item.rows);assert(metadata.width<=1024&&metadata.height<=1024);assert(metadata.hasAlpha);
 assert.equal(metadata.size,item.bytes);totalBytes+=metadata.size;decodedBytes+=metadata.width*metadata.height*4;
 for(const frame of [0,Math.floor(item.frames/4),Math.floor(item.frames/2),item.frames-1]){
  const actual=await image.clone().extract({left:frame%item.columns*SIZE,top:Math.floor(frame/item.columns)*SIZE,width:SIZE,height:SIZE}).ensureAlpha().raw().toBuffer();
  const expected=await sharp(Buffer.from(frameSvg(effect,frame/FPS))).ensureAlpha().raw().toBuffer();
  for(let pixel=0;pixel<actual.length;pixel+=4){
   assert(Math.abs(actual[pixel+3]-expected[pixel+3])<=2,`${effect} packed frame ${frame} alpha`);
   if(actual[pixel+3]>0)assert(actual[pixel]>=253&&actual[pixel+1]>=253&&actual[pixel+2]>=253,`${effect} must remain white/alpha`);
  }
 }
}
assert.equal(Object.keys(badgeEffectTextures).length,5);assert(decodedBytes<7*1024*1024);
// Keep the original geometry and phase/opacity landmarks, not simplified patterns.
assert.equal((frameSvg('foil',0).match(/<path /g)??[]).length,18);
assert.equal((frameSvg('interference',0).match(/<stop /g)??[]).length,9);
assert.equal((frameSvg('lenticular',0).match(/<rect /g)??[]).length,12);
for(const [effect,progress,expected] of [['foil',.16,.85],['lenticular',.43,.9],['afterglow',.15,.78],['afterglow',.35,.3]])assert(Math.abs(opacity(effect,progress*EFFECTS[effect].duration)-expected)<1e-6,effect+' original opacity');
assert(frameSvg('ribbon',0).includes('matrix(1 0 -.25 1 .125 0)'));
// 100 badges with five types still use a single timer and only five writes/tick.
let time=0,sequence=0;const timers=new Map(),writes=[];
const clock={setTimeout(fn,ms){assert.equal(ms,50);timers.set(++sequence,fn);return sequence;},clearTimeout(id){timers.delete(id);}};
const ticker=createSharedEffectClock((effect,frame)=>writes.push([effect,frame]),clock,()=>time);
const types=Object.keys(badgeEffectTextures),hundredBadges=Array.from({length:100},(_,index)=>types[index%5]);
ticker.setActive(hundredBadges);assert.equal(timers.size,1);assert.equal(writes.length,5);
for(let tick=1;tick<=20;tick++){
 time=tick*50;const [id,fn]=[...timers.entries()][0];timers.delete(id);fn();assert.equal(timers.size,1);
}
assert.equal(writes.length,105,'five shared frame writes at 20 fps plus initial frame');
ticker.stop();assert.equal(timers.size,0);
for(const [effect,item] of Object.entries(badgeEffectTextures))for(const frame of [0,7,Math.floor(item.frames/2),item.frames-1]){
 let position;
 const sample=createSharedEffectClock((type,actual,x,y)=>{position={actual,x,y};},clock,()=>frame*50);
 sample.setActive([effect]);assert.equal(position.actual,frame);
 assert(Math.abs(position.x/100*(item.columns*SIZE-SIZE)-(frame%item.columns)*SIZE)<1e-7);
 assert(Math.abs(position.y/100*(item.rows*SIZE-SIZE)-Math.floor(frame/item.columns)*SIZE)<1e-7);
 sample.stop();
}
const before=writes.length;ticker.setActive([]);assert.equal(writes.length,before);assert.equal(timers.size,0);
ticker.setActive(['foil','foil']);assert.equal(timers.size,1);assert.equal(writes.length,before);
time+=50;const [id,fn]=[...timers.entries()][0];timers.delete(id);fn();assert.equal(writes.length,before+1);ticker.stop();
// Runtime overlays contain no SVG, gradients, IDs or animated child elements.
class Element{constructor(){this.nodeType=1;this.className='';this.dataset={};this.style={cssText:''};this.children=[];this.classList={contains:name=>this.className.split(' ').includes(name)};}append(node){this.children.push(node);}setAttribute(){}cloneNode(){return this;}}
globalThis.document={createElement:()=>new Element()};
const visibleBadges=hundredBadges.map(effect=>({isConnected:true,dataset:{badgeEffect:effect},classList:{contains:()=>false},closest:()=>null}));
assert.equal(activeBadgeEffectTypes(visibleBadges).size,5);
assert.equal(activeBadgeEffectTypes(visibleBadges,true).size,0,'hidden/reduced-motion must stop the shared clock');
assert.equal(activeBadgeEffectTypes(visibleBadges.map(e=>({...e,closest:()=>({})}))).size,0,'paused roots must stop');
assert.equal(activeBadgeEffectTypes(visibleBadges.map(e=>({...e,isConnected:false}))).size,0,'removed badges must stop');
assert.equal(activeBadgeEffectTypes(visibleBadges.map(e=>({...e,classList:{contains:name=>name==='is-paused'}}))).size,0,'manual pause must stop');
const {createBadgeEffect,cloneBadgeVisual}=await import('../src/scripts/nickname-badge-effects.js');
for(const effect of types){const node=createBadgeEffect(effect,{renderer:'png'});assert.equal(node.children.length,0);assert(node.style.backgroundImage.includes(badgeEffectTextures[effect].src));assert(node.classList.contains('is-offscreen'));const copy=cloneBadgeVisual(node);assert.equal(copy.style.cssText,node.style.cssText);}
const css=fs.readFileSync(new URL('src/styles/nickname-badge-effects.css',root),'utf8');assert(css.includes('@keyframes'));assert(!css.includes('@keyframes badge-css-background'));assert(!css.includes('will-change'));assert(css.includes('is-paused')&&css.includes('prefers-reduced-motion'));
const gallery=fs.readFileSync(new URL('dist/test/achievement-badges/effect-performance/index.html',root),'utf8');
assert(gallery.includes('effects-check')&&!gallery.includes('effects-check effects-paused'));assert(gallery.includes('id="playAllEffects" aria-pressed="true"')); assert.equal([...gallery.matchAll(/data-play-effect=/g)].length,5);assert(!gallery.includes('effectStressList'));
const gallerySource=fs.readFileSync(new URL('src/pages/test/achievement-badges/effect-performance/index.astro',root),'utf8');assert(!gallerySource.includes('6000')&&!gallerySource.includes('createTimedEffectPreview'));assert(gallerySource.includes('is-paused'));assert(gallerySource.includes("let selected='all';"));assert(!gallerySource.includes('some(overlay=>visible.get(overlay)))player.stop()'));
console.log(`Legacy PNG comparison: ${totalBytes} bytes; decoded RGBA estimate ${decodedBytes} bytes. Frame/alpha fidelity, 100-badge shared scheduling, idle stop, child-free overlays and continuous gallery: passed.`);

// Original 3.2s light motion, then a fully transparent interval before repeating.
assert.equal(EFFECTS.interference.duration,6.4);
assert(Math.abs(opacity('interference',2.08+1.6)-.8)<1e-6);
for(let i=0;i<9;i++){
 const phase=i*.26,start=2.08-phase;
 assert(Math.abs(opacity('interference',start,phase))<1e-10);
 assert(Math.abs(opacity('interference',start+1.6,phase)-.8)<1e-6);
 assert.equal(opacity('interference',start+3.2+.001,phase),0);
}
for(let time=5.3;time<6.4;time+=.05){
 const pixels=await sharp(Buffer.from(frameSvg('interference',time))).ensureAlpha().raw().toBuffer();
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],0,'interference rest must have no white light');
}

const stress=fs.readFileSync(new URL('dist/test/achievement-badges/effect-stress/index.html',root),'utf8');
assert(stress.includes('effect-stress effects-paused'));
for(const count of [30,100])assert(stress.includes(`data-count="${count}"`));
assert(stress.includes('.effect-stress .stress-visual{'));

// CSS mode has fixed white light geometry, no sprite image or JS frame updates.
const geometryCounts={ribbon:1,foil:18,interference:9,lenticular:12,afterglow:1};
for(const [effect,count] of Object.entries(geometryCounts)){
 const overlay=createBadgeEffect(effect,{renderer:'css'});
 assert.equal(overlay.children.length,count);
 assert.equal(overlay.dataset.effectRenderer,'css');
 assert.equal(overlay.style.backgroundImage,undefined);
 const copy=cloneBadgeVisual(overlay);assert.equal(copy.dataset.effectRenderer,'css');assert.equal(copy.children.length,count);
 assert.equal(activeBadgeEffectTypes([{...visibleBadges[0],dataset:{badgeEffect:effect,effectRenderer:'css'}}]).size,0,'CSS badges must never start the JS frame timer');
 for(const light of overlay.children)assert.equal(light.children.length,0);
}
assert.equal(css.match(/@keyframes badge-css-interference-/g).length,9);
for(const name of ['afterglow','ribbon','foil','lenticular'])assert(css.includes('@keyframes badge-css-'+name));
assert(css.includes('mix-blend-mode:plus-lighter'));
assert(css.includes('badge-effects-hidden')&&css.includes('animation-play-state:paused!important'));
// No animated paint properties: declarations inside keyframes are opacity/transform only.
for(const rule of css.matchAll(/@keyframes\s+[^{}]+\{((?:[^{}]*\{[^{}]*\}\s*)+)\}/g)){
 for(const declaration of rule[1].matchAll(/([\w-]+)\s*:/g))assert(['opacity','transform'].includes(declaration[1]),declaration[1]);
}
for(const mode of ['css','png'])assert(stress.includes('data-badge-renderer="'+mode+'"')&&gallery.includes('data-badge-renderer="'+mode+'"'));
console.log('CSS layer counts, unchanged masks, native-only keyframes, no CSS frame timer, clone preservation, pause hooks and CSS/PNG controls: passed.');
// Static radial bases with additive alpha reconstruct the former animated stops.
const radial=createBadgeEffect('interference',{renderer:'css'}),bases=[];
for(const light of radial.children){
 assert(light.style.backgroundImage.startsWith('radial-gradient(ellipse 90% 90% at 30% 35%,'));
 const stops=[...light.style.backgroundImage.matchAll(/(white|transparent) ([\d.]+)%/g)].map(([,color,offset])=>`<stop offset="${Number(offset)/100}" stop-color="white" stop-opacity="${color==='white'?1:0}"/>`).join('');
 bases.push(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><defs><radialGradient id="b" cx=".3" cy=".35" r=".9">${stops}</radialGradient></defs><rect width="24" height="24" fill="url(#b)"/></svg>`)).ensureAlpha().raw().toBuffer());
}
for(const time of [0,.8,1.6,2.4,3.7,4.8,5.5,6.3]){
 const expected=await sharp(Buffer.from(frameSvg('interference',time))).ensureAlpha().raw().toBuffer();
 for(let pixel=3;pixel<expected.length;pixel+=4){
  const alpha=bases.reduce((sum,base,i)=>sum+base[pixel]*opacity('interference',time,i*.26),0);
  assert(Math.abs(alpha-expected[pixel])<3,'fixed radial bases must preserve the light pattern');
 }
}

// Same geometry and phase for the approved SVG and current CSS foil.
const currentFoil=createBadgeEffect('foil',{renderer:'css'});
assert(css.includes('badge-css-foil 5.2s linear infinite'));
assert(css.includes('@keyframes badge-css-foil{0%,34%,100%{opacity:0}10%{opacity:.12}16%{opacity:.85}23%{opacity:.2}}'));
for(let i=0;i<18;i++){
 const face=currentFoil.children[i];
 assert(Math.abs(parseFloat(face.style.left)*24/100-Math.floor(i/2)%3*8)<1e-10);
 assert(Math.abs(parseFloat(face.style.top)*24/100-Math.floor(i/6)*8)<1e-10);
 assert.equal(parseFloat(face.style.animationDelay),-(i*7%18)*5.2/18);
 assert.equal(face.style.clipPath,i%2?'polygon(0 0,100% 0,100% 100%)':'polygon(0 0,0 100%,100% 100%)');
}
const comparison=fs.readFileSync(new URL('dist/test/achievement-badges/foil-compare/index.html',root),'utf8');
assert(comparison.includes('foil-compare effects-paused'));
for(const icon of ['star','trophy','flower','puzzle'])assert(comparison.includes('data-foil-group="'+icon+'"'));
assert.equal([...comparison.matchAll(/data-foil-current=/g)].length,16);
const compareSource=fs.readFileSync(new URL('src/pages/test/achievement-badges/foil-compare/index.astro',root),'utf8');
assert(compareSource.includes('animation.currentTime=time'));
assert(compareSource.includes("'background-position',`${x}% ${y}%`,'important'"));
assert(!compareSource.includes('setInterval')&&!compareSource.includes('requestAnimationFrame'));
console.log('Approved/current foil geometry and timing parity; four-icon, two-size synchronized paused comparison: passed.');
