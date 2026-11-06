let timer,loading,visitPending=false,serverOffset=0,retryDelay=1000;
window.puzzleCosmeticRelease={active:false,launch_at:null};
async function recordVisit(){
 await window.puzzleAuthReady;
 const account=window.puzzleAccount;if(!window.puzzleCosmeticRelease.active||!account.user||!account.profile||visitPending)return;
 const owner=account.user.id,key=`cosmetic-visit:${owner}`,day=new Date(Date.now()+serverOffset+9*3600000).toISOString().slice(0,10);
 try{if(sessionStorage.getItem(key)===day)return;}catch{}
 visitPending=true;
 try{
  const {data,error}=await account.client.rpc('record_site_visit',{request_id:crypto.randomUUID()});if(error)throw error;
  if(account.user?.id===owner){window.showAchievementNotifications?.(data);try{sessionStorage.setItem(key,day);}catch{}window.dispatchEvent(new Event('cosmetic-refresh'));}
 }catch(error){console.warn('Attendance could not be recorded',error);}finally{visitPending=false;}
}
export async function refreshCosmeticRelease(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   const result=await window.sbPublicRpc('cosmetic_release_context',{});
   retryDelay=1000;window.puzzleCosmeticRelease=result;serverOffset=Date.parse(result.server_now)-Date.now();clearTimeout(timer);
   let delay;
   if(result.active){const day=86400000;delay=day-((Date.now()+serverOffset+9*3600000)%day);}
   else if(result.launch_at)delay=Date.parse(result.launch_at)-Date.parse(result.server_now);
   if(delay!==undefined)timer=setTimeout(()=>{window.puzzleCosmeticReleaseReady=refreshCosmeticRelease();},Math.min(Math.max(delay+150,1000),2147483647));
   window.dispatchEvent(new CustomEvent('cosmetic-release-ready',{detail:result}));void recordVisit();
   return result;
  }catch(error){console.warn('Cosmetic release context unavailable',error);clearTimeout(timer);timer=setTimeout(()=>{window.puzzleCosmeticReleaseReady=refreshCosmeticRelease();},retryDelay);retryDelay=Math.min(retryDelay*2,30000);return window.puzzleCosmeticRelease;}
  finally{loading=null;}
 })();return loading;
}
window.puzzleCosmeticReleaseReady=refreshCosmeticRelease();
window.addEventListener('puzzle-auth-ready',()=>void recordVisit());
const refresh=()=>{if(!document.hidden)window.puzzleCosmeticReleaseReady=refreshCosmeticRelease();};
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
