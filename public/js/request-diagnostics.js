// Only request metadata is collected. Never serialize URLs with queries, bodies,
// authorization headers, exception messages, account IDs or puzzle answers.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
  const triggers = new Set(['initial', 'poll', 'visible', 'rollover', 'retry', 'submit', 'rank-mode', 'auth', 'sdk', 'interaction']);
  const queue = [];
  const recent = new Map();
  let active = 0, timer, sending = false, emitted = 0, lifecycle = 0, probes = 0, lastProbe = -Infinity;
  let attempts = 0;
  const storagePrefix = 'vodka_request_event_v3:';
  const storageTTL = 24 * 60 * 60 * 1000;
  const eventKey = event => `${storagePrefix}${event.client_request_id}:${event.phase}`;
  function storage(action) { try { return action(window.localStorage); } catch { return undefined; } }
  function restore(raw) {
    // Read only this schema back from storage; never forward arbitrary saved fields.
    if (!raw || raw.expires <= Date.now() || raw.expires > Date.now() + storageTTL) return null;
    const value = raw.event, result = { version: 1 };
    if (!value || value.version !== 1) return null;
    const patterns = { endpoint: /^\/(?:rest\/v1\/(?:rpc\/)?[a-z_]+|auth\/v1\/[a-z_]+|functions\/v1\/[a-z-]+|other)$/,
      page: /^\/(?:\d{6}_\d{2}\/|daily-sudoku\/|time-machine\/|nickname\/|auth\/callback\/|admin\/|customize\/|test\/|other\/)?$/,
      at: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, page_id: /^[a-f0-9-]{36}$/,
      client_request_id: /^[a-f0-9-]{36}$/, request_id: /^[a-fA-F0-9-]{0,64}$/, code: /^[A-Za-z0-9_]{0,48}$/ };
    for (const [field, pattern] of Object.entries(patterns)) {
      if (typeof value[field] !== 'string' || !pattern.test(value[field])) return null;
      result[field] = value[field];
    }
    if (value.started_at !== undefined) { if (!patterns.at.test(value.started_at)) return null;result.started_at = value.started_at; }
    const enums = { trigger: [...triggers], visibility: ['hidden', 'visible'], phase: ['request', 'probe'], browser: ['chromium', 'firefox', 'safari', 'other'],
      error_name: ['TypeError', 'AbortError', 'TimeoutError', 'Error', 'Other'], error_kind: ['aborted', 'timeout', 'fetch_failed', 'other'],
      timing: ['exposed', 'restricted', 'missing', 'ambiguous'], protocol: ['h2', 'h3', 'http/1.1'] };
    for (const [field, allowed] of Object.entries(enums)) {
      if (value[field] === undefined && !['trigger', 'visibility', 'phase'].includes(field)) continue;
      if (!allowed.includes(value[field])) return null;result[field] = value[field];
    }
    for (const [field, max] of Object.entries({ duration_ms: 3600000, concurrent: 10000, status: 599, wall_ms: 86400000, resource_ms: 86400000, dns_ms: 86400000, connect_ms: 86400000, ttfb_ms: 86400000 })) {
      if (value[field] === undefined && !['duration_ms', 'concurrent', 'status'].includes(field)) continue;
      if (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > max) return null;result[field] = value[field];
    }
    if ((value.status !== 0 && value.status < 100) || (value.status > 0 && value.status < 400 && value.duration_ms < 2000)) return null;
    for (const field of ['online', 'signal_aborted', 'lifecycle_changed']) {
      if (value[field] === undefined && field !== 'online') continue;
      if (typeof value[field] !== 'boolean') return null;result[field] = value[field];
    }
    for (const field of ['probe_site', 'probe_api']) {
      const probe = value[field];if (probe === undefined) continue;
      if (!probe || !Number.isInteger(probe.status) || probe.status < 0 || probe.status > 599 || (probe.status > 0 && probe.status < 100) || !Number.isInteger(probe.duration_ms) || probe.duration_ms < 0 || probe.duration_ms > 86400000 || !['none', 'timeout', 'TypeError', 'AbortError', 'TimeoutError', 'Error', 'Other'].includes(probe.error)) return null;
      result[field] = { status: probe.status, duration_ms: probe.duration_ms, error: probe.error };
    }
    return result;
  }
  storage(store => {
    const keys = Object.keys(store).filter(key => key.startsWith(storagePrefix));
    for (const key of keys) {
      let event;try { const text = store.getItem(key);event = text.length <= 4096 ? restore(JSON.parse(text)) : null; } catch {}
      if (!event || eventKey(event) !== key || queue.length >= 80) store.removeItem(key);else queue.push(event);
    }
  });
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
    for (let i = queue.length - 1; i >= 0; i--) {
      if (Date.now() - Date.parse(queue[i].at) > storageTTL) {
        const expired = queue.splice(i, 1)[0];storage(store => store.removeItem(eventKey(expired)));
      }
    }
    if (sending || !queue.length || attempts >= 8) return;
    const events = queue.slice(0, 10);
    sending = true;
    attempts++;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    // Persist before sending. Only an acknowledged successful upload removes rows.
    nativeFetch(`${apiOrigin}/functions/v1/client-events`, {
      method: 'POST', credentials: 'omit', keepalive: true,
      signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }),
    }).then(response => {
      if (!response.ok) return;
      const keys = new Set(events.map(eventKey));
      for (let i = queue.length - 1; i >= 0; i--) if (keys.has(eventKey(queue[i]))) queue.splice(i, 1);
      storage(store => { for (const key of keys) store.removeItem(key); });
      attempts = 0;
    }).catch(() => {}).finally(() => { clearTimeout(timeout);sending = false;if (queue.length) schedule(attempts ? Math.min(300000, 15000 * 2 ** (attempts - 1)) : 1500); });
  }
  function schedule(delay = 1500) { if (!timer && attempts < 8) timer = setTimeout(flush, delay); }
  function record(event) {
    const key = `${event.phase || 'request'}:${event.endpoint}:${event.status}:${event.code}:${event.trigger}:${event.error_kind || ''}`;
    const now = Date.now();
    if (emitted >= 40 || now - (recent.get(key) || 0) < 30000) return;
    recent.set(key, now);emitted++;
    const row = { version: 1, at: new Date().toISOString(), page: page(), page_id: pageId,
      visibility: document.hidden ? 'hidden' : 'visible', online: navigator.onLine !== false, ...event };
    if (queue.length >= 80) { const dropped = queue.shift();storage(store => store.removeItem(eventKey(dropped))); }
    queue.push(row);
    storage(store => store.setItem(eventKey(row), JSON.stringify({ expires: Date.now() + storageTTL, event: row })));
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
  window.addEventListener('online', () => { attempts = 0;flush(); });
  if (queue.length) schedule();
})();
