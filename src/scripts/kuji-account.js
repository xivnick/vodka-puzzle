let snapshot = {owner: null, events: []};
let revision = 0, inFlight = null, scheduled = false;
const listeners = new Set();
function publish(next) {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}
export function subscribeKujiAccount(listener) {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}
export async function refreshKujiAccount() {
  const account = window.puzzleAccount;
  const owner = account?.user?.id ?? null;
  if (!owner || !account.profile || account.error) {
    revision++;
    publish({owner: null, events: []});
    return;
  }
  if (snapshot.owner !== owner) publish({owner, events: []});
  if (inFlight?.owner === owner) return inFlight.promise;
  const request = ++revision;
  const flight = {owner, promise: null};
  inFlight = flight;
  flight.promise = (async () => {
    try {
      const {data, error} = await account.client.rpc('kuji_account_summary').abortSignal(AbortSignal.timeout(15000));
      if (request !== revision || owner !== window.puzzleAccount.user?.id || error) return;
      publish({owner, events: data?.events ?? []});
    } catch { /* Keep the last confirmed state for this account on temporary failure. */ }
    finally { if (inFlight === flight) inFlight = null; }
  })();
  return flight.promise;
}
export function applyKujiContext(context) {
  const account = window.puzzleAccount;
  const owner = account?.user?.id;
  if (!owner || !account.profile || account.error) return;
  revision++;
  const events = snapshot.owner === owner ? snapshot.events.filter(event => event.id !== context.id) : [];
  const participated = context.tickets.some(ticket => ticket.is_me === true && ticket.claimed_at);
  if (context.remaining_tickets > 0 || participated) events.push({
    id: context.id, title: context.title, status: context.status,
    remaining_tickets: context.remaining_tickets, participated,
  });
  publish({owner, events});
}
function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; void refreshKujiAccount(); });
}
window.puzzleAuthReady.then(scheduleRefresh);
window.addEventListener('puzzle-auth-ready', () => {
  revision++;
  publish({owner: null, events: []});
  scheduleRefresh();
});
window.addEventListener('focus', scheduleRefresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
window.addEventListener('pageshow', event => { if (event.persisted) scheduleRefresh(); });
