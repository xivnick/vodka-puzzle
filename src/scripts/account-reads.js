// Shared short-lived reads, scoped to the account and server day boundary.
const entries=new Map();
let generation=0;
export function invalidateAccountReads(){generation++;entries.clear();}
export async function readAccount(account,name,args={}){
 const owner=account.user?.id,epoch=generation;
 const key=JSON.stringify([owner,name,args]);
 const prior=entries.get(key);
 if(prior&&prior.until>Date.now())return prior.promise;
 const entry={until:Infinity,promise:null};
 entry.promise=(async()=>{
  const {data,error}=await account.client.rpc(name,args);
  if(account.user?.id!==owner||generation!==epoch)throw new Error('ACCOUNT_CHANGED');
  if(error)throw error;
  entry.until=Date.now()+1000;
  return data;
 })().catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
 entries.set(key,entry);return entry.promise;
}
if(typeof window!=='undefined'){
 window.addEventListener('puzzle-auth-ready',invalidateAccountReads);
 window.addEventListener('puzzle-rewards-changed',invalidateAccountReads);
}

const channel=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('puzzle-account-changes'):null;
export function notifyAccountChange(owner){invalidateAccountReads();channel?.postMessage({owner});}
if(channel)channel.onmessage=({data})=>{
 if(data?.owner!==window.puzzleAccount?.user?.id)return;
 invalidateAccountReads();
 if(!document.hidden)window.dispatchEvent(new Event('cosmetic-refresh'));
};
