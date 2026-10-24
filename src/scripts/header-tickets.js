let revision = 0;
export function setHeaderTickets(count) {
  revision++;
  const link = document.getElementById('headerTickets');
  if (!link) return;
  const visible = Number.isInteger(count) && count > 0;
  link.hidden = !visible;
  document.getElementById('headerTicketCount').textContent = visible ? String(count) : '';
  link.setAttribute('aria-label', `타임머신, 보유 티켓 ${visible ? count : 0}개`);
  link.title = `보유 티켓 ${visible ? count : 0}개 · 타임머신`;
}
export async function refreshHeaderTickets() {
  const account = window.puzzleAccount;
  const owner = account.user?.id;
  const request = ++revision;
  if (!owner || account.error) { setHeaderTickets(null); return; }
  try {
    const {data, error} = await account.client.rpc('time_machine_context');
    if (request !== revision || owner !== window.puzzleAccount.user?.id) return;
    setHeaderTickets(error ? null : data?.tickets);
  } catch {
    if (request === revision) setHeaderTickets(null);
  }
}
window.puzzleAuthReady.then(() => {
  refreshHeaderTickets();
  window.addEventListener('puzzle-auth-ready', refreshHeaderTickets);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshHeaderTickets();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) refreshHeaderTickets();
  });
});
