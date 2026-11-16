// Only request metadata is collected. Never serialize URLs with queries, bodies,
// authorization headers, exception messages, account IDs or puzzle answers.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
  const triggers = new Set(['initial', 'poll', 'visible', 'rollover', 'retry', 'submit', 'rank-mode', 'auth', 'sdk', 'interaction']);
  const queue = [];
  const recent = new Map();
  let active = 0, timer, sending = false, emitted = 0, lifecycle = 0, probes = 0, lastProbe = -Infinity;
  const pageId = crypto.randomUUID();
  const browser = /Firefox\//.test(navigator.userAgent || '') ? 'firefox'
    : /Edg\/|Chrome\/|Chromium\//.test(navigator.userAgent || '') ? 'chromium'
    : /Safari\//.test(navigator.userAgent || '') ? 'safari' : 'other';
  function errorName(error) {
    return ['TypeError', 'AbortError', 'TimeoutError', 'Error'].includes(error?.name) ? error.name : 'Other';
  }
  function errorKind(error, signal) {
    if (error?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError') return 'timeout';
    if (signal?.aborted || error?.name === 'AbortError') return 'aborted';
    // Only fixed categories leave the browser; exception text can contain URLs.
    if (/failed to fetch|fetch failed|networkerror|network error|load failed/i.test(error?.message || '')) return 'fetch_failed';
    return 'other';
  }
  function resourceTiming(url, start) {
    try {
      // Do not assign overlapping same-URL entries to an arbitrary request.
      const entries = performance.getEntriesByName?.(url.href, 'resource')?.filter(entry => Math.abs(entry.startTime - start) < 5) || [];
      if (entries.length !== 1) return { timing: entries.length ? 'ambiguous' : 'missing' };
      const entry = entries[0];
      const result = { timing: entry.requestStart > 0 ? 'exposed' : 'restricted', resource_ms: Math.round(entry.duration) };
      if (['h2', 'h3', 'http/1.1'].includes(entry.nextHopProtocol)) result.protocol = entry.nextHopProtocol;
      // Cross-origin timing without Timing-Allow-Origin is hidden, not zero latency.
      if (entry.requestStart > 0) {
        for (const [name, from, to] of [['dns_ms', 'domainLookupStart', 'domainLookupEnd'], ['connect_ms', 'connectStart', 'connectEnd'], ['ttfb_ms', 'requestStart', 'responseStart']]) {
          if (entry[from] > 0 && entry[to] >= entry[from]) result[name] = Math.round(entry[to] - entry[from]);
        }
      }
      return result;
    } catch { return { timing: 'missing' }; }
  }
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
    const key = `${event.phase || 'request'}:${event.endpoint}:${event.status}:${event.code}:${event.trigger}:${event.error_kind || ''}`;
    const now = Date.now();
    if (emitted >= 40 || now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);emitted++;
    queue.push({ version: 1, at: new Date().toISOString(), page: page(), page_id: pageId,
      visibility: document.hidden ? 'hidden' : 'visible', online: navigator.onLine !== false, ...event });
    if (queue.length >= 10) flush();else schedule();
  }
  async function probe(url, headers = {}) {
    const start = performance.now(), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await nativeFetch(url, { headers, cache: 'no-store', credentials: 'omit', signal: controller.signal });
      await response.arrayBuffer();
      return { status: response.status, duration_ms: Math.round(performance.now() - start), error: 'none' };
    } catch (error) {
      return { status: 0, duration_ms: Math.round(performance.now() - start), error: controller.signal.aborted ? 'timeout' : errorName(error) };
    } finally { clearTimeout(timeout); }
  }
  function checkConnection(event, apikey) {
    if (!apikey || document.hidden || event.lifecycle_changed || event.signal_aborted || probes >= 3 || performance.now() - lastProbe < 60000) return;
    lastProbe = performance.now();probes++;
    // Read-only reachability probes; never retry submissions or forward a user token.
    Promise.all([
      probe('/diagnostics/ping.json'),
      probe(`${apiOrigin}/auth/v1/health`, { apikey, 'x-client-info': `vodka-probe/${event.client_request_id}` }),
    ]).then(([site, api]) => record({ ...event, phase: 'probe', probe_site: site, probe_api: api })).catch(() => {});
  }
  window.puzzleFetch = async (input, options = {}) => {
    const { puzzleTrigger, ...init } = options;
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== apiOrigin) return nativeFetch(input, init);
    const endpoint = /^\/(?:rest\/v1\/(?:rpc\/)?[a-z_]+|auth\/v1\/[a-z_]+|functions\/v1\/[a-z-]+)$/.test(url.pathname) ? url.pathname : '/other';
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const tag = headers.get('x-client-info');
    const requestedTrigger = puzzleTrigger || (tag?.startsWith('vodka-trigger/') ? tag.slice(14) : 'sdk');
    const trigger = triggers.has(requestedTrigger) ? requestedTrigger : 'interaction';
    const client_request_id = crypto.randomUUID();
    // sb-request-id is not CORS-exposed. x-client-info is already allowed and
    // recorded by the gateway, including when the browser cannot read a response.
    headers.set('x-client-info', `${tag ? tag + '; ' : ''}vodka-diag/${client_request_id}`);
    init.headers = headers;
    const signal = init.signal || (input instanceof Request ? input.signal : undefined);
    const start = performance.now(), started_at = new Date().toISOString(), startWall = Date.now(), startLifecycle = lifecycle, concurrent = ++active;
    let response, failure, failed = false;
    try {
      response = await nativeFetch(input, init);
      return response;
    } catch (error) { failed = true;failure = error;throw error; }
    finally {
      active--;
      const duration_ms = Math.round(performance.now() - start);
      if (failed || !response?.ok || duration_ms >= 2000) {
        const event = { endpoint, trigger, duration_ms, concurrent, status: response?.status || 0,
          code: failed ? 'FETCH_ERROR' : '', request_id: response?.headers.get('sb-request-id') || '',
          client_request_id, started_at, phase: 'request', browser,
          wall_ms: Math.max(0, Date.now() - startWall), signal_aborted: signal?.aborted === true, lifecycle_changed: lifecycle !== startLifecycle,
          ...resourceTiming(url, start),
          ...(failed ? { error_name: errorName(failure), error_kind: errorKind(failure, signal) } : {}) };
        // Inspect only the bounded error code, asynchronously; never the message.
        if (response && !response.ok) {
          response.clone().json().then(body => {
            const code = body?.code || body?.error_code;
            if (/^[A-Za-z0-9_]{1,48}$/.test(code || '')) event.code = code;
          }).catch(() => {}).finally(() => record(event));
        } else record(event);
        if (failed) checkConnection(event, headers.get('apikey'));
      }
    }
  };
  document.addEventListener('visibilitychange', () => { lifecycle++;if (document.hidden) flush(); });
  window.addEventListener('pagehide', () => { lifecycle++;flush(); });
})();
