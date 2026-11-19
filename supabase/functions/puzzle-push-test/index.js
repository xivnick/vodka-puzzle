import webPush from 'npm:web-push@3.6.7';

const site = 'https://puzzle.xivnick.me';
const cors = {
  'Access-Control-Allow-Origin': site,
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function reply(status, body) {
  return Response.json(body, { status, headers: cors });
}

function validSubscription(subscription) {
  if (typeof subscription?.endpoint !== 'string' || subscription.endpoint.length > 2048) return false;
  if (!/^B[A-Za-z0-9_-]{86}$/.test(subscription.keys?.p256dh ?? '') ||
      !/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth ?? '')) return false;

  const url = URL.parse(subscription.endpoint);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.search) return false;
  if (url.hostname === 'fcm.googleapis.com') return /^\/fcm\/send\/[\w:-]+$/.test(url.pathname);
  if (url.hostname === 'updates.push.services.mozilla.com') return /^\/wpush\/v2\/[\w-]+$/.test(url.pathname);
  return url.hostname.endsWith('.push.apple.com') && /^\/[\w-]+$/.test(url.pathname);
}

function projectFetch(path, token, init = {}) {
  const { headers, ...options } = init;
  return fetch(`${Deno.env.get('SUPABASE_URL')}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, apikey: Deno.env.get('SUPABASE_ANON_KEY'), ...headers },
    signal: AbortSignal.timeout(8000),
  });
}

async function subscriptions(query, method, value) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await projectFetch(`/rest/v1/puzzle_push_subscriptions?${new URLSearchParams(query)}`, key, {
    method,
    headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: value ? JSON.stringify(value) : undefined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('SUBSCRIPTION_STORAGE_FAILED');
  }
  if (method === 'GET') return response.json();
  await response.body?.cancel();
}

const testPayload = JSON.stringify({ title: '테스트 알림', body: '테스트 알림입니다.' });

async function sendPush(subscription, payload, vapidDetails) {
  const details = webPush.generateRequestDetails(subscription, payload, {
    TTL: 300,
    vapidDetails,
  });
  const headers = new Headers(details.headers);
  headers.delete('content-length');
  const result = await fetch(details.endpoint, {
    method: details.method,
    headers,
    body: details.body,
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  await result.body?.cancel();
  if (result.ok) return 'accepted';
  if ([404, 410].includes(result.status)) return 'expired';
  console.warn('Test push rejected', result.status);
  return 'failed';
}

async function sendBatch(cursor, vapidDetails) {
  const batchSize = 48;
  const rows = await subscriptions({
    select: 'id,endpoint,p256dh,auth,updated_at',
    order: 'id.asc',
    limit: String(batchSize + 1),
    ...(cursor ? { id: `gt.${cursor}` } : {}),
  }, 'GET');
  const counts = { accepted: 0, expired: 0, failed: 0 };
  const batch = rows.slice(0, batchSize);
  for (let index = 0; index < batch.length; index += 12) {
    await Promise.all(batch.slice(index, index + 12).map(async row => {
      try {
        const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
        if (!validSubscription(subscription)) {
          counts.failed++;
          return;
        }
        const result = await sendPush(subscription, testPayload, vapidDetails);
        counts[result]++;
        if (result === 'expired') {
          await subscriptions({ id: `eq.${row.id}`, updated_at: `eq.${row.updated_at}` }, 'DELETE').catch(() => {
            console.warn('Could not remove expired push subscription');
          });
        }
      } catch {
        counts.failed++;
      }
    }));
  }
  return { ...counts, nextCursor: rows.length > batchSize ? batch.at(-1).id : null };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'LOGIN_REQUIRED' });

  try {
    const token = authorization.slice(7);
    const { action, subscription, cursor } = (await request.json().catch(() => null)) ?? {};
    const registrationAction = action === 'register' || action === 'unregister';
    const isDailyReminder = action === 'send-daily-reminder';
    if (action !== 'config' && action !== 'send-all' &&
        (!(registrationAction || isDailyReminder || action === 'send') || !validSubscription(subscription))) {
      return reply(400, { error: 'INVALID_REQUEST' });
    }
    if (action === 'send-all' && cursor != null &&
        (typeof cursor !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(cursor))) {
      return reply(400, { error: 'INVALID_REQUEST' });
    }

    if (registrationAction || action === 'config') {
      const user = await projectFetch('/auth/v1/user', token);
      if ([401, 403].includes(user.status)) return reply(user.status, { error: 'LOGIN_REQUIRED' });
      if (!user.ok) return reply(503, { error: 'AUTH_CHECK_FAILED' });
      const { id } = await user.json();
      if (!id) return reply(401, { error: 'LOGIN_REQUIRED' });
      if (action === 'register') {
        await subscriptions({ on_conflict: 'endpoint' }, 'POST', {
          account_id: id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updated_at: new Date().toISOString(),
        });
        return reply(200, { registered: true });
      }
      if (action === 'unregister') {
        await subscriptions({ account_id: `eq.${id}`, endpoint: `eq.${subscription.endpoint}` }, 'DELETE');
        return reply(200, { registered: false });
      }
    } else {
      const admin = await projectFetch('/rest/v1/rpc/is_puzzle_admin', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if ([401, 403].includes(admin.status)) return reply(admin.status, { error: 'ADMIN_REQUIRED' });
      if (!admin.ok) return reply(503, { error: 'ADMIN_CHECK_FAILED' });
      if (await admin.json() !== true) return reply(403, { error: 'ADMIN_REQUIRED' });
    }

    const { publicKey, privateKey } = JSON.parse(Deno.env.get('PUZZLE_PUSH_TEST_VAPID') || 'null') ?? {};
    if (!publicKey || !privateKey) return reply(503, { error: 'PUSH_UNAVAILABLE' });
    if (action === 'config') return reply(200, { publicKey });
    const vapidDetails = { subject: site, publicKey, privateKey };
    if (action === 'send-all') return reply(200, await sendBatch(cursor, vapidDetails));

    const payload = isDailyReminder
      ? JSON.stringify({ title: '데일리 리마인더', body: '데일리 스도쿠 마감까지 1시간 남았습니다.' })
      : testPayload;
    const result = await sendPush(subscription, payload, vapidDetails);
    if (result === 'accepted') return reply(200, { accepted: true });
    if (result === 'expired') return reply(410, { error: 'SUBSCRIPTION_EXPIRED' });
    return reply(502, { error: 'PUSH_REJECTED' });
  } catch {
    return reply(502, { error: 'PUSH_REQUEST_FAILED' });
  }
});
