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
    if(!release?.active)return;
    if(root.dataset.customize!=='true'&&(!window.puzzleAccount.user||!window.puzzleAccount.profile))return;
    const legacy=document.querySelector('#accountLegacyPanel');if(legacy)legacy.hidden=true;
    if(root.dataset.customize!=='true'){
     const logout=document.querySelector('#logout'),footer=root.querySelector('.account-footer');
     logout.className='account-action';root.querySelector('.account-logout').append(logout);
     const admin=document.querySelector('#adminLink');if(admin)footer.append(admin);
     footer.append(document.querySelector('#nickStatus'));
     const deletion=document.querySelector('#deleteAccount');deletion.className='account-action delete-account';footer.append(deletion);
    }
    panel.hidden=false;
   }
   if(started)return;started=true;
   const {initializeLiveMypage}=await import('./mypage-live.js');await initializeLiveMypage(root);
  }
  void start();window.addEventListener('cosmetic-release-ready',()=>void start());
 }else initMypage(root);
}
