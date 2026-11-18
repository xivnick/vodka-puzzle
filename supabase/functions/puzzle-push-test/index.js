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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'LOGIN_REQUIRED' });

  try {
    const admin = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_puzzle_admin`, {
      method: 'POST',
      headers: { authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if ([401, 403].includes(admin.status)) return reply(admin.status, { error: 'ADMIN_REQUIRED' });
    if (!admin.ok) return reply(503, { error: 'ADMIN_CHECK_FAILED' });
    if (await admin.json() !== true) return reply(403, { error: 'ADMIN_REQUIRED' });

    const body = await request.json().catch(() => null);
    const { action, subscription } = body ?? {};
    if (action !== 'config' && (action !== 'send' || !validSubscription(subscription))) {
      return reply(400, { error: 'INVALID_REQUEST' });
    }

    const { publicKey, privateKey } = JSON.parse(Deno.env.get('PUZZLE_PUSH_TEST_VAPID') || 'null') ?? {};
    if (!publicKey || !privateKey) return reply(503, { error: 'PUSH_UNAVAILABLE' });
    if (action === 'config') return reply(200, { publicKey });

    const payload = JSON.stringify({ title: '보드카 퍼즐', body: '시험 알림입니다. 눌러서 시험 페이지를 열어 보세요.' });
    const details = webPush.generateRequestDetails(subscription, payload, {
      TTL: 300,
      vapidDetails: { subject: site, publicKey, privateKey },
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
    if (result.ok) return reply(200, { accepted: true });
    if ([404, 410].includes(result.status)) return reply(410, { error: 'SUBSCRIPTION_EXPIRED' });
    console.warn('Test push rejected', result.status);
    return reply(502, { error: 'PUSH_REJECTED' });
  } catch {
    return reply(502, { error: 'PUSH_REQUEST_FAILED' });
  }
});
