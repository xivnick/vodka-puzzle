// The effect gallery starts stopped and plays only one selected example briefly.
export function createTimedEffectPreview(onChange,clock=globalThis){
  let selected=null,timer=null;
  function stop(){
    if(timer!==null)clock.clearTimeout(timer);
    timer=null;selected=null;onChange(null);
  }
  function toggle(key){
    const wasSelected=selected===key;
    stop();
    if(wasSelected)return;
    selected=key;onChange(key);
    timer=clock.setTimeout(stop,6000);
  }
  return {toggle,stop,get selected(){return selected;}};
}
