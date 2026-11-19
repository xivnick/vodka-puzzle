export async function invokePushTest(action, target, preference) {
  const { data, error } = await window.puzzleAccount.client.functions.invoke('puzzle-push-test', {
    body: { action, subscription: target?.toJSON(), preference },
  });
  if (error) {
    const status = error.context instanceof Response ? error.context.status : null;
    if (status === 410) throw new Error('SUBSCRIPTION_EXPIRED');
    if (status === 401 || status === 403) throw new Error('ADMIN_REQUIRED');
    throw error;
  }
  return data;
}

export async function preparePushTest(scope) {
  const { publicKey } = await invokePushTest('config');
  await navigator.serviceWorker.register(`${scope}worker.js`, { scope });
  const registration = await navigator.serviceWorker.ready;
  if (registration.scope !== new URL(scope, location.origin).href) throw new Error('WRONG_SCOPE');
  const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  return { registration, applicationServerKey };
}
