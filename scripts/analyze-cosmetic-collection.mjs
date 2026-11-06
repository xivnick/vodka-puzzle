// Exact weighted coupon collection, without crafting or starting inventory.
// State = unique common / rare / epic counts; equal odds within each rarity.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync(new URL('../src/data/mypage-v2-preview.json',import.meta.url),'utf8'));
const counts=[data.common.length,data.rare.length,data.effects.length],weights=[.72,.24,.04];
const total=counts.reduce((a,b)=>a+b),target=Math.ceil(total/2),price=100,refunds=[0,100,500];
const strideR=counts[2]+1,strideC=(counts[1]+1)*strideR,length=(counts[0]+1)*strideC;
const index=(c,r,e)=>c*strideC+r*strideR+e;
const states=Array.from({length:target},()=>[]);
for(let c=0;c<=counts[0];c++)for(let r=0;r<=counts[1];r++)for(let e=0;e<=counts[2];e++)if(c+r+e<target)states[c+r+e].push([c,r,e]);
const mean=new Float64Array(length),refundMean=new Float64Array(length);
for(let sum=target-1;sum>=0;sum--)for(const owned of states[sum]){
 const id=index(...owned),fresh=owned.map((n,i)=>weights[i]*(counts[i]-n)/counts[i]),p=fresh.reduce((a,b)=>a+b);
 let futureTime=0,futureRefund=owned.reduce((sum,n,i)=>sum+weights[i]*n/counts[i]*refunds[i],0);
 for(let rarity=0;rarity<3;rarity++)if(fresh[rarity]&&sum+1<target){
  const next=[...owned];next[rarity]++;
  futureTime+=fresh[rarity]*mean[index(...next)];futureRefund+=fresh[rarity]*refundMean[index(...next)];
 }
 mean[id]=(1+futureTime)/p;refundMean[id]=futureRefund/p;
}
let distribution=new Float64Array(length);distribution[0]=1;
let cdf=0,tailMean=0;const quantiles={},checkpoints={},expectedOwned=[0,0,0];
for(let draws=1;draws<=500&&1-cdf>1e-12;draws++){
 tailMean+=1-cdf;
 const nextDistribution=new Float64Array(length);
 for(let sum=0;sum<target;sum++)for(const owned of states[sum]){
  const id=index(...owned),mass=distribution[id];if(!mass)continue;
  const fresh=owned.map((n,i)=>weights[i]*(counts[i]-n)/counts[i]);
  nextDistribution[id]+=mass*(1-fresh.reduce((a,b)=>a+b));
  for(let rarity=0;rarity<3;rarity++)if(fresh[rarity]){
   const next=[...owned];next[rarity]++;const chance=mass*fresh[rarity];
   if(sum+1===target){cdf+=chance;for(let i=0;i<3;i++)expectedOwned[i]+=chance*next[i];}
   else nextDistribution[index(...next)]+=chance;
  }
 }
 distribution=nextDistribution;
 for(const q of [.1,.5,.9,.95,.99])if(quantiles[q]===undefined&&cdf>=q)quantiles[q]=draws;
 if([30,40,50,60,70,80,100].includes(draws))checkpoints[draws]=cdf;
}
assert(Math.abs(tailMean-mean[0])<1e-8,'Expected waiting time must agree with the independent survival distribution');
assert(Math.abs(expectedOwned.reduce((a,b)=>a+b)-target)<1e-8,'Absorbed collection must contain the target number of unique items');
const halfByRarity=counts.map((count,i)=>({rarity:['common','rare','epic'][i],target:Math.ceil(count/2),meanDraws:Array.from({length:Math.ceil(count/2)},(_,owned)=>1/(weights[i]*(count-owned)/count)).reduce((a,b)=>a+b)}));
console.log(JSON.stringify({counts,weights,total,target,meanDraws:mean[0],quantiles,chanceOfHalfByDraws:checkpoints,grossCoinSpend:mean[0]*price,meanDuplicateRefund:refundMean[0],meanNetCoinSpend:mean[0]*price-refundMean[0],meanOwnedAtHalf:expectedOwned,halfByRarity},null,2));
