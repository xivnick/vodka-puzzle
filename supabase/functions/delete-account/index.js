export function createHandler(env, requestFetch = fetch) {
  const cors = { 'Access-Control-Allow-Origin': 'https://xivnick.me', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return async request => {
    if (request.headers.get('origin') && request.headers.get('origin') !== 'https://xivnick.me') return reply(403, { error: 'Forbidden origin' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    const authorization = request.headers.get('authorization');
    if (!/^Bearer \S+$/i.test(authorization || '')) return reply(401, { error: 'Sign in required' });
    try {
      const url = env('SUPABASE_URL');
      const key = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) return reply(503, { error: 'Service unavailable' });
      const verified = await requestFetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: authorization } });
      if (!verified.ok) return reply(401, { error: 'Invalid session' });
      const user = await verified.json();
      if (!user.id || user.app_metadata?.provider !== 'google') return reply(403, { error: 'Google account required' });
      // The target comes only from the verified session, never from the request body.
      const deleted = await requestFetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ should_soft_delete: false }) });
      if (!deleted.ok) return reply(500, { error: 'Deletion failed' });
      return reply(200, { deleted: true });
    } catch { return reply(503, { error: 'Service unavailable' }); }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler(name => Deno.env.get(name)));
