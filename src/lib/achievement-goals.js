export function isAchievementThreshold(mission,at){
  if(mission.stages.some(stage=>stage.at===at))return true;
  if(!mission.repeatEvery)return false;
  const start=mission.repeatStart??Math.max(...mission.stages.map(stage=>stage.at))+mission.repeatEvery;
  return at>=start&&(at-start)%mission.repeatEvery===0;
}
export function getAchievementGoal(mission){
  const claimed=new Set(mission.claimed);
  const initial=mission.stages.find(stage=>!claimed.has(stage.at));
  if(initial)return initial;
  if(!mission.repeatEvery)return;
  let at=mission.repeatStart??Math.max(...mission.stages.map(stage=>stage.at))+mission.repeatEvery;
  while(claimed.has(at))at+=mission.repeatEvery;
  if(mission.repeatCoinOptions)return {at,kind:'random-coins',options:mission.repeatCoinOptions};
  if(mission.repeatTickets)return {at,kind:'tickets',value:mission.repeatTickets};
  return {at,kind:'coins',value:mission.repeatCoins};
}
