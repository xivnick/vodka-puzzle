"""Read bounded client/DB diagnostics and a current resource snapshot, without PII."""
import argparse
import datetime
import json
import pathlib
import re
import urllib.parse
import urllib.request
from database import PROJECT, query

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--minutes', type=int, default=30)
parser.add_argument('--trace', help='Client request UUID from a v2 diagnostic event')
args = parser.parse_args()
if not 1 <= args.minutes <= 1440:
    parser.error('--minutes must be between 1 and 1440')
if args.trace and not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', args.trace):
    parser.error('--trace must be a lowercase UUID')
token = (pathlib.Path.home() / '.supabase/access-token').read_text().strip()
base = f'https://api.supabase.com/v1/projects/{PROJECT}'


def get(path):
    request = urllib.request.Request(base + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode()


now = datetime.datetime.now(datetime.timezone.utc)
start = now - datetime.timedelta(minutes=args.minutes)


def logs(sql):
    params = {'sql': sql, 'iso_timestamp_start': start.strftime('%Y-%m-%dT%H:%M:%SZ'),
              'iso_timestamp_end': now.strftime('%Y-%m-%dT%H:%M:%SZ')}
    result = json.loads(get('/analytics/endpoints/logs?' + urllib.parse.urlencode(params)))
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result.get('result', [])


trace_filter = " AND event_message LIKE '%" + args.trace + "%'" if args.trace else ''
client_events = logs("SELECT timestamp,event_message FROM logs WHERE source='function_logs' AND event_message LIKE '%\"kind\":\"client_request\"%'" + trace_filter + " ORDER BY timestamp DESC LIMIT 100")
print(json.dumps({'window_start': start.isoformat(), 'window_end': now.isoformat(), 'client_events': client_events}, ensure_ascii=False, indent=2))
failures = logs("""SELECT toStartOfMinute(timestamp) AS minute,source,count() AS failures
FROM logs WHERE (source IN ('postgres_logs','postgrest_logs') AND event_message LIKE '%canceling statement due to statement timeout%')
OR (source='auth_logs' AND (event_message LIKE '%context deadline exceeded%' OR event_message LIKE '%context canceled%'))
GROUP BY minute,source ORDER BY minute DESC LIMIT 100""")
print(json.dumps({'database_auth_failures': failures}, indent=2))
gateway = logs("""SELECT log_attributes['request.path'] AS path,
log_attributes['request.method'] AS method,log_attributes['response.status_code'] AS status,
count() AS requests,max(toFloat64OrZero(log_attributes['response.origin_time'])) AS max_origin_ms
FROM logs WHERE source='edge_logs'
AND (toUInt16OrZero(log_attributes['response.status_code'])>=400
OR toFloat64OrZero(log_attributes['response.origin_time'])>=2000)
GROUP BY path,method,status ORDER BY requests DESC LIMIT 40""")
print(json.dumps({'gateway_slow_or_failed': gateway}, indent=2))
if args.trace:
    # x-client-info preserves SDK tags and the random diagnostic UUID. Never
    # select request URLs, query strings, JWT fields, user agents or IP addresses.
    matched = logs("""SELECT timestamp,log_attributes['request_id'] AS request_id,
log_attributes['request.path'] AS path,log_attributes['request.method'] AS method,
log_attributes['response.status_code'] AS status,
log_attributes['response.origin_time'] AS origin_ms,
log_attributes['response.headers.x_envoy_upstream_service_time'] AS upstream_ms,
log_attributes['response.headers.cf_ray'] AS cf_ray,log_attributes['request.cf.colo'] AS colo
FROM logs WHERE source='edge_logs' AND log_attributes['request.headers.x_client_info'] LIKE '%/""" + args.trace + "%' ORDER BY timestamp LIMIT 30")
    print(json.dumps({'trace_gateway_requests': matched}, indent=2))
resources = []
for line in get('/analytics/endpoints/metrics').splitlines():
    if re.match(r'node_(load[0-9]+|memory_(MemAvailable|MemTotal|SwapFree|SwapTotal)_bytes|vmstat_(oom_kill|pswpin|pswpout))\{', line):
        resources.append(line)
print(json.dumps({'metrics_at': now.isoformat(), 'resources': resources}, indent=2))
print(json.dumps({'connections': query("BEGIN READ ONLY; SELECT state,wait_event_type,count(*) FROM pg_stat_activity WHERE backend_type='client backend' GROUP BY state,wait_event_type; COMMIT;")}, indent=2))
