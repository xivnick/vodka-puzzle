import webPush from 'npm:web-push@3.6.7';
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

async function subscriptions(query, method, value, prefer) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await projectFetch(`/rest/v1/puzzle_push_subscriptions?${new URLSearchParams(query)}`, key, {
    method,
    headers: { apikey: key, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: value ? JSON.stringify(value) : undefined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('SUBSCRIPTION_STORAGE_FAILED');
  }
  if (method === 'GET' || prefer?.includes('return=representation')) return response.json();
  await response.body?.cancel();
}

const preferences = ['daily_sudoku', 'new_puzzle', 'daily_reminder'];
const testPayload = JSON.stringify({ title: '테스트 알림', body: '테스트 알림입니다' });

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
  return result.status === 429 || result.status >= 500 ? 'retry' : 'failed';
}

function pushKeys() {
  return JSON.parse(Deno.env.get('PUZZLE_PUSH_TEST_VAPID') || 'null') ?? {};
}

async function dispatchRpc(name, args) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await projectFetch(`/rest/v1/rpc/${name}`, key, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(name);
  }
  if (!args) return response.json();
  await response.body?.cancel();
}

async function dispatchNotifications(token) {
  const secret = Deno.env.get('PUZZLE_NOTIFICATION_DISPATCH_TOKEN');
  const match = /^(\d{10})\.([\da-f]{64})$/.exec(token);
  if (!secret || !match) return reply(403, { error: 'DISPATCH_FORBIDDEN' });
  const [, issued, signature] = match;
  const expected = createHmac('sha256', secret).update(issued).digest();
  if (Math.abs(Date.now() / 1000 - Number(issued)) > 120 ||
      !timingSafeEqual(Buffer.from(signature, 'hex'), expected)) return reply(403, { error: 'DISPATCH_FORBIDDEN' });
  const { publicKey, privateKey } = pushKeys();
  if (!publicKey || !privateKey) return reply(503, { error: 'PUSH_UNAVAILABLE' });
  const vapidDetails = { subject: site, publicKey, privateKey };
  const counts = { sent: 0, expired: 0, retry: 0, failed: 0, uncertain: 0 };
  for (let batch = 0; batch < 3; batch++) {
    const deliveries = await dispatchRpc('claim_puzzle_notifications');
    if (!deliveries.length) break;
    await Promise.all(deliveries.map(async delivery => {
      const { endpoint, p256dh, auth, title, body, path, tag } = delivery;
      const target = { endpoint, keys: { p256dh, auth } };
      let outcome = 'failed';
      if (validSubscription(target)) {
        try {
          outcome = await sendPush(target, JSON.stringify({ title, body, path, tag }), vapidDetails);
          if (outcome === 'accepted') outcome = 'sent';
        } catch {
          outcome = 'uncertain';
        }
      }
      await dispatchRpc('finish_puzzle_notification', {
        delivery_id: delivery.delivery_id, attempt: delivery.attempt, outcome,
        subscription_revision: delivery.subscription_revision,
      });
      counts[outcome]++;
    }));
  }
  return reply(200, counts);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'LOGIN_REQUIRED' });

  try {
    const token = authorization.slice(7);
    const { action, subscription, preference } = (await request.json().catch(() => null)) ?? {};
    if (action === 'dispatch') return await dispatchNotifications(token);
    const isDailyReminder = action === 'send-daily-reminder';
    const ownSubscription = ['register', 'unregister', 'send-self', 'set-preference'].includes(action);
    if (action !== 'config' &&
        (!(ownSubscription || isDailyReminder || action === 'send') || !validSubscription(subscription))) {
      return reply(400, { error: 'INVALID_REQUEST' });
    }
    if (action === 'set-preference' &&
        (!preferences.includes(preference?.name) || typeof preference.enabled !== 'boolean')) {
      return reply(400, { error: 'INVALID_PREFERENCE' });
    }

    if (ownSubscription || action === 'config') {
      const user = await projectFetch('/auth/v1/user', token);
      if ([401, 403].includes(user.status)) return reply(user.status, { error: 'LOGIN_REQUIRED' });
      if (!user.ok) return reply(503, { error: 'AUTH_CHECK_FAILED' });
      const { id } = await user.json();
      if (!id) return reply(401, { error: 'LOGIN_REQUIRED' });
      if (action === 'register') {
        const [settings] = await subscriptions({ on_conflict: 'endpoint', select: preferences.join(',') }, 'POST', {
          account_id: id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updated_at: new Date().toISOString(),
        }, 'resolution=merge-duplicates,return=representation');
        return reply(200, { registered: true, preferences: settings });
      }
      if (ownSubscription) {
        const owned = { account_id: `eq.${id}`, endpoint: `eq.${subscription.endpoint}` };
        if (action === 'unregister') {
          await subscriptions(owned, 'DELETE');
          return reply(200, { registered: false });
        }
        const verified = {
          ...owned,
          select: 'id',
          p256dh: `eq.${subscription.keys.p256dh}`,
          auth: `eq.${subscription.keys.auth}`,
        };
        const rows = action === 'set-preference'
          ? await subscriptions(verified, 'PATCH', { [preference.name]: preference.enabled }, 'return=representation')
          : await subscriptions(verified, 'GET');
        if (rows.length === 0) return reply(409, { error: 'SUBSCRIPTION_NOT_REGISTERED' });
        if (action === 'set-preference') return reply(200, { saved: true });
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

    const { publicKey, privateKey } = pushKeys();
    if (!publicKey || !privateKey) return reply(503, { error: 'PUSH_UNAVAILABLE' });
    if (action === 'config') return reply(200, { publicKey });
    const vapidDetails = { subject: site, publicKey, privateKey };

    const payload = isDailyReminder
      ? JSON.stringify({ title: '데일리 리마인더', body: '데일리 스도쿠 마감까지 1시간 남았습니다' })
      : testPayload;
    const result = await sendPush(subscription, payload, vapidDetails);
    if (result === 'accepted') return reply(200, { accepted: true });
    if (result === 'expired') return reply(410, { error: 'SUBSCRIPTION_EXPIRED' });
    return reply(502, { error: 'PUSH_REJECTED' });
  } catch {
    return reply(502, { error: 'PUSH_REQUEST_FAILED' });
  }
});
