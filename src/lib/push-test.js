export async function invokePushTest(action, target, cursor) {
  const { data, error } = await window.puzzleAccount.client.functions.invoke('puzzle-push-test', {
    body: { action, subscription: target?.toJSON(), cursor },
  });
  if (error) {
    const status = error.context instanceof Response ? error.context.status : null;
    if (status === 410) throw new Error('SUBSCRIPTION_EXPIRED');
    if (status === 401 || status === 403) throw new Error('ADMIN_REQUIRED');
    throw error;
  }
  return data;
}

export async function broadcastPushTest() {
  let cursor;
  const counts = { accepted: 0, expired: 0, failed: 0 };
  do {
    const batch = await invokePushTest('send-all', undefined, cursor);
    for (const status of Object.keys(counts)) counts[status] += batch[status];
    cursor = batch.nextCursor;
  } while (cursor);
  if (!(counts.accepted + counts.expired + counts.failed)) return '등록된 앱이 없습니다.';
  return [
    counts.accepted ? `${counts.accepted}개 앱에 시험 발송을 접수했습니다.` : '접수된 알림이 없습니다.',
    counts.expired ? `만료 ${counts.expired}개` : '',
    counts.failed ? `실패 ${counts.failed}개` : '',
  ].filter(Boolean).join(' ');
}

export async function preparePushTest(scope) {
  const { publicKey } = await invokePushTest('config');
  await navigator.serviceWorker.register(`${scope}worker.js`, { scope });
  const registration = await navigator.serviceWorker.ready;
  if (registration.scope !== new URL(scope, location.origin).href) throw new Error('WRONG_SCOPE');
  const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  return { registration, applicationServerKey };
}
