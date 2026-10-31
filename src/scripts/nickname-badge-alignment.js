// Center the visible SVG geometry on the measured text ink, relative to the
// shared baseline. No icon-specific viewBox, width, or vertical offset is used.
export function initNicknameBadges() {
  const badges=[...document.querySelectorAll('[data-nickname-badge]:not([data-alignment-ready])')];
  if(!badges.length)return;
  const context=document.createElement('canvas').getContext('2d');
  const metrics=new Map();
  function align(badge){
    const name=badge.querySelector('[data-badge-name]');
    const svg=badge.querySelector('svg');
    if(!name.getClientRects().length)return;
    if(!svg.dataset.normalized){
      const bounds=svg.getBBox();
      const stroke=parseFloat(getComputedStyle(svg).strokeWidth)||0;
      const side=Math.max(bounds.width,bounds.height)+stroke;
      if(side>0){
        svg.setAttribute('viewBox',`${bounds.x+bounds.width/2-side/2} ${bounds.y+bounds.height/2-side/2} ${side} ${side}`);
        svg.setAttribute('preserveAspectRatio','xMidYMid meet');
        svg.dataset.normalized='true';
      }
    }
    if(!context)return;
    const style=getComputedStyle(name);
    const font=style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text=name.textContent;
    const key=JSON.stringify([font,text]);
    if(!metrics.has(key)){
      context.font=font;
      context.textBaseline='alphabetic';
      const measure=context.measureText(text);
      metrics.set(key,(measure.actualBoundingBoxDescent-measure.actualBoundingBoxAscent)/2);
    }
    const center=metrics.get(key);
    const size=badge.querySelector('.badge-anchor').getBoundingClientRect().width;
    if(Number.isFinite(center)&&size>0)badge.style.setProperty('--badge-top',`${center-size/2}px`);
  }
  let frame;
  const refresh=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>badges.forEach(align));};
  const observer=new ResizeObserver(refresh);
  badges.forEach(badge=>{badge.dataset.alignmentReady='true';observer.observe(badge.querySelector('[data-badge-name]'));align(badge);});
  // Re-measure fallback fonts once the actual webfont arrives, and whenever
  // another font is loaded. ResizeObserver handles responsive font sizes.
  document.fonts.ready.then(refresh);
  document.fonts.addEventListener('loadingdone',refresh);
}
