import {initMypage} from './mypage-v2-preview.js';
import {createCosmeticAccountClient,normalizeCosmeticItem,cosmeticError} from './cosmetic-account-client.js';
export async function initializeLiveMypage(root){
 const status=document.querySelector('#cosmeticLiveStatus');
 try{
  await window.puzzleAuthReady;const account=window.puzzleAccount;
  if(account.error)throw new Error(account.error);
  if(!account.user||!account.profile){
   status.textContent=account.user?'닉네임을 먼저 설정해 주세요.':'로그인 후 이용할 수 있습니다.';
   const link=document.createElement('a');link.href='/nickname/?next='+encodeURIComponent(location.pathname);link.textContent=account.user?'닉네임 설정':'로그인';status.append(' ',link);return;
  }
  const template=JSON.parse(root.querySelector('#mypagePreviewData').textContent),server=createCosmeticAccountClient(account,template);
  server.resultItem=normalizeCosmeticItem;await server.initialize();
  root.hidden=false;initMypage(root,{server});status.hidden=true;
  const refresh=()=>{if(!document.hidden)window.dispatchEvent(new Event('cosmetic-refresh'));};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  function scheduleMidnight(){const day=86400000,delay=day-((Date.now()+9*3600000)%day)+250;setTimeout(()=>{refresh();scheduleMidnight();},delay);}
  scheduleMidnight();
 }catch(error){console.error('Cosmetic page initialization failed',error);status.textContent=cosmeticError(error);status.hidden=false;root.hidden=true;}
}
