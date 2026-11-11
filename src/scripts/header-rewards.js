import {subscribeKujiAccount} from './kuji-account.js';
let revision = 0;
let scheduled = false;
let rewardReady = false;
let kujiSummary = {owner: null, events: []};

function renderHeaderNotifications() {
  const dot = document.getElementById('headerRewardDot');
  const link = document.getElementById('nicknameLink');
  if (!dot || !link) return;
  const account = window.puzzleAccount;
  const signedIn = Boolean(account.user && account.profile && !account.error);
  const rewards = signedIn && rewardReady && window.puzzleCosmeticRelease?.active;
  const kuji = signedIn && kujiSummary.owner === account.user.id && kujiSummary.events.some(event => event.status === 'active' && event.remaining_tickets > 0);
  const visible = rewards || kuji;
  dot.hidden = !visible;
  if (visible) {
    const text = rewards && kuji ? '받을 수 있는 보상과 사용할 수 있는 쿠지 티켓이 있어요' : kuji ? '사용할 수 있는 쿠지 티켓이 있어요' : '받을 수 있는 보상이 있어요';
    dot.setAttribute('aria-label', text);
    link.setAttribute('aria-describedby', 'headerRewardDot');
    link.title = text;
  } else {
    link.removeAttribute('aria-describedby');
    link.removeAttribute('title');
  }
}
export function setHeaderRewardReady(ready) {
  revision++;
  rewardReady = Boolean(ready);
  renderHeaderNotifications();
}
subscribeKujiAccount(summary => {
  kujiSummary = summary;
  renderHeaderNotifications();
});

async function refreshHeaderRewards() {
  const account = window.puzzleAccount;
  const owner = account.user?.id;
  const request = ++revision;
  if (!owner || !account.profile || account.error || !window.puzzleCosmeticRelease?.active) {
    setHeaderRewardReady(false);
    return;
  }
  try {
    const {data, error} = await account.client.rpc('achievement_context');
    if (request !== revision || owner !== window.puzzleAccount.user?.id) return;
    const claimable = row => row.state === 'claimable' && row.configured && row.active !== false;
    setHeaderRewardReady(!error && ((data?.achievements ?? []).some(claimable) || (data?.daily_tasks ?? []).some(claimable)));
  } catch {
    if (request === revision) setHeaderRewardReady(false);
  }
}

function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void refreshHeaderRewards();
  });
}

window.puzzleAuthReady.then(scheduleRefresh);
window.addEventListener('puzzle-auth-ready', () => {
  setHeaderRewardReady(false);
  scheduleRefresh();
});
window.addEventListener('cosmetic-release-ready', scheduleRefresh);
window.addEventListener('puzzle-rewards-changed', scheduleRefresh);
window.addEventListener('cosmetic-refresh', scheduleRefresh);
window.addEventListener('focus', scheduleRefresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleRefresh();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) scheduleRefresh();
});
