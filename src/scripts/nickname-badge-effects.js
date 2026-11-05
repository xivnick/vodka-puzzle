export function createBadgeEffect(effect){
  const overlay=document.createElement('span');
  overlay.className='custom-badge-effect effect-'+effect;
  overlay.setAttribute('aria-hidden','true');
  if(effect==='lenticular'){
    for(let index=0;index<12;index++){
      const slice=document.createElement('span');
      slice.className='lenticular-slice';
      slice.style.left=`${index*100/12}%`;
      slice.style.width=`${100/12}%`;
      slice.style.animationDelay=`${(-index*.12).toFixed(2)}s`;
      overlay.append(slice);
    }
  }
  return overlay;
}
