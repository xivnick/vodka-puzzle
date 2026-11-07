// Only request metadata is collected. Never serialize URLs with queries, bodies,
// authorization headers, exception messages, account IDs or puzzle answers.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
  const triggers = new Set(['initial', 'poll', 'visible', 'rollover', 'retry', 'submit', 'rank-mode', 'auth', 'sdk', 'interaction']);
  const queue = [];
  const recent = new Map();
  let active = 0, timer, sending = false, emitted = 0;
  const pageId = crypto.randomUUID();
  function page() {
    const path = location.pathname;
    return /^\/(?:\d{6}_\d{2}\/|daily-sudoku\/|time-machine\/|nickname\/|auth\/callback\/|admin\/|customize\/)?$/.test(path)
      ? path : path.startsWith('/test/') ? '/test/' : '/other/';
  }
  function flush() {
    clearTimeout(timer);timer = undefined;
    if (sending || !queue.length) return;
    const events = queue.splice(0, 10);
    sending = true;
    // Logging never retries or blocks the original request, even during an outage.
    nativeFetch(`${apiOrigin}/functions/v1/client-events`, {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }),
    }).catch(() => {}).finally(() => { sending = false;if (queue.length) schedule(); });
  }
  function schedule() { if (!timer) timer = setTimeout(flush, 1500); }
  function record(event) {
    const key = `${event.endpoint}:${event.status}:${event.code}:${event.trigger}`;
    const now = Date.now();
    if (emitted >= 40 || now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);emitted++;
    queue.push({ version: 1, at: new Date().toISOString(), page: page(), page_id: pageId,
      visibility: document.hidden ? 'hidden' : 'visible', online: navigator.onLine !== false, ...event });
    if (queue.length >= 10) flush();else schedule();
  }
  window.puzzleFetch = async (input, options = {}) => {
    const { puzzleTrigger, ...init } = options;
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== apiOrigin) return nativeFetch(input, init);
    const endpoint = /^\/(?:rest\/v1\/(?:rpc\/)?[a-z_]+|auth\/v1\/[a-z_]+|functions\/v1\/[a-z-]+)$/.test(url.pathname) ? url.pathname : '/other';
    const tag = new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).get('x-client-info');
    const requestedTrigger = puzzleTrigger || (tag?.startsWith('vodka-trigger/') ? tag.slice(14) : 'sdk');
    const trigger = triggers.has(requestedTrigger) ? requestedTrigger : 'interaction';
    const start = performance.now(), concurrent = ++active;
    let response, failed = false;
    try {
      response = await nativeFetch(input, init);
      return response;
    } catch (error) { failed = true;throw error; }
    finally {
      active--;
      const duration_ms = Math.round(performance.now() - start);
      if (failed || !response.ok || duration_ms >= 2000) {
        const event = { endpoint, trigger, duration_ms, concurrent, status: response?.status || 0,
          code: failed ? 'FETCH_ERROR' : '', request_id: response?.headers.get('sb-request-id') || '' };
        // Inspect only the bounded error code, asynchronously; never the message.
        if (response && !response.ok) {
          response.clone().json().then(body => {
            const code = body?.code || body?.error_code;
            if (/^[A-Za-z0-9_]{1,48}$/.test(code || '')) event.code = code;
          }).catch(() => {}).finally(() => record(event));
        } else record(event);
      }
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
})();
