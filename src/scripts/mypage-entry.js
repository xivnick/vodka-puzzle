import {initMypage} from './mypage-v2-preview.js';
const root=document.querySelector('.mypage-v2[data-customize]');
if(root){
 if(root.dataset.live==='true'){
  const panel=document.querySelector('#cosmeticLivePanel');let started=false;
  async function start(){
   if(started)return;
   if(panel.dataset.production==='true'){
    await window.puzzleAuthReady;
    const release=await window.puzzleCosmeticReleaseReady;
    if(!release?.active||new URLSearchParams(location.search).has('manage'))return;
    if(root.dataset.customize!=='true'&&(!window.puzzleAccount.user||!window.puzzleAccount.profile))return;
    const legacy=document.querySelector('#accountLegacyPanel');if(legacy)legacy.hidden=true;
    panel.hidden=false;
   }
   if(started)return;started=true;
   const {initializeLiveMypage}=await import('./mypage-live.js');await initializeLiveMypage(root);
  }
  void start();window.addEventListener('cosmetic-release-ready',()=>void start());
 }else initMypage(root);
}
