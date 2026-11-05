export function getAchievementGoal(mission){
  const claimed=new Set(mission.claimed);
  const initial=mission.stages.find(stage=>!claimed.has(stage.at));
  if(initial)return initial;
  if(!mission.repeatEvery)return;
  let at=Math.max(...mission.stages.map(stage=>stage.at))+mission.repeatEvery;
  while(claimed.has(at))at+=mission.repeatEvery;
  return {at,kind:'coins',value:mission.repeatCoins};
}
