const svgNamespace='http://www.w3.org/2000/svg';
let nextEffectId=0;
const svgElement=(name,attributes={})=>{
  const element=document.createElementNS(svgNamespace,name);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
};
function gradient(defs,name,id,attributes,stops){
  const element=svgElement(name,{id,...attributes});
  for(const attributes of stops)element.append(svgElement('stop',attributes));
  defs.append(element);return element;
}

// Geometry, timing and phase match the approved selected-effects preview.
// Masking stays on the outer span so this works with SVG and raster icons alike.
export function createBadgeEffect(effect){
  if(!['ribbon','foil','interference','lenticular','afterglow'].includes(effect))throw new RangeError('Unknown badge effect');
  const overlay=document.createElement('span');
  overlay.className='custom-badge-effect effect-'+effect+' is-offscreen';
  overlay.dataset.badgeEffect=effect;
  overlay.setAttribute('aria-hidden','true');
  const svg=svgElement('svg',{viewBox:'0 0 24 24',fill:'white',stroke:'none',focusable:'false'});
  const defs=svgElement('defs'),id=`badge-effect-${++nextEffectId}`;
  svg.append(defs);overlay.append(svg);
  if(effect==='ribbon'){
    gradient(defs,'linearGradient',id,{gradientTransform:'matrix(1 0 -.25 1 .125 0)'},[
      {offset:0,'stop-color':'white','stop-opacity':0},
      {offset:.43,'stop-color':'white','stop-opacity':0},
      {offset:.5,'stop-color':'white','stop-opacity':.95},
      {offset:.57,'stop-color':'white','stop-opacity':0},
      {offset:1,'stop-color':'white','stop-opacity':0},
    ]);
    svg.append(svgElement('rect',{class:'ribbon-light',x:-72,y:0,width:96,height:24,fill:`url(#${id})`}));
  }
  if(effect==='foil'){
    for(let index=0;index<18;index++){
      const x=(Math.floor(index/2)%3)*8,y=Math.floor(index/6)*8;
      const face=svgElement('path',{class:'foil-face',d:index%2?`M${x} ${y} L${x+8} ${y} L${x+8} ${y+8}Z`:`M${x} ${y} L${x} ${y+8} L${x+8} ${y+8}Z`});
      face.style.animationDelay=`${-(index*7%18)*5.2/18}s`;svg.append(face);
    }
  }
  if(effect==='interference'){
    const radial=svgElement('radialGradient',{id,cx:.3,cy:.35,r:.9});
    for(let index=0;index<9;index++){
      const stop=svgElement('stop',{class:'interference-stop',offset:index/8,'stop-color':'white','stop-opacity':0});
      stop.style.animationDelay=`${-index*.26}s`;radial.append(stop);
    }
    defs.append(radial);
    svg.append(svgElement('rect',{width:24,height:24,fill:`url(#${id})`}));
  }
  if(effect==='lenticular'){
    gradient(defs,'linearGradient',id,{},[
      {'stop-color':'white','stop-opacity':0},
      {offset:.5,'stop-color':'white','stop-opacity':.85},
      {offset:1,'stop-color':'white','stop-opacity':0},
    ]);
    for(let index=0;index<12;index++){
      const slice=svgElement('rect',{class:'lenticular-slice',x:index*2,y:0,width:2,height:24,fill:`url(#${id})`});
      slice.style.animationDelay=`${-index*.12}s`;svg.append(slice);
    }
  }
  if(effect==='afterglow')svg.append(svgElement('rect',{class:'afterglow-light',width:24,height:24}));
  return overlay;
}

// A normal clone would duplicate gradient IDs and bind the second badge to the
// first badge's animated stops. Build a fresh effect when copying badge visuals.
export function cloneBadgeVisual(node){
  if(node.nodeType===1&&node.classList.contains('custom-badge-effect')){
    const copy=createBadgeEffect(node.dataset.badgeEffect);
    copy.style.cssText=node.style.cssText;
    return copy;
  }
  return node.cloneNode(true);
}
