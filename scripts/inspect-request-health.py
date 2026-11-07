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
args = parser.parse_args()
if not 1 <= args.minutes <= 1440:
    parser.error('--minutes must be between 1 and 1440')
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


client_events = logs("SELECT timestamp,event_message FROM logs WHERE source='function_logs' AND event_message LIKE '%\"kind\":\"client_request\"%' ORDER BY timestamp DESC LIMIT 100")
print(json.dumps({'window_start': start.isoformat(), 'window_end': now.isoformat(), 'client_events': client_events}, ensure_ascii=False, indent=2))
failures = logs("""SELECT toStartOfMinute(timestamp) AS minute,source,count() AS failures
FROM logs WHERE (source IN ('postgres_logs','postgrest_logs') AND event_message LIKE '%canceling statement due to statement timeout%')
OR (source='auth_logs' AND (event_message LIKE '%context deadline exceeded%' OR event_message LIKE '%context canceled%'))
GROUP BY minute,source ORDER BY minute DESC LIMIT 100""")
print(json.dumps({'database_auth_failures': failures}, indent=2))
resources = []
for line in get('/analytics/endpoints/metrics').splitlines():
    if re.match(r'node_(load[0-9]+|memory_(MemAvailable|MemTotal|SwapFree|SwapTotal)_bytes|vmstat_(oom_kill|pswpin|pswpout))\{', line):
        resources.append(line)
print(json.dumps({'metrics_at': now.isoformat(), 'resources': resources}, indent=2))
print(json.dumps({'connections': query("BEGIN READ ONLY; SELECT state,wait_event_type,count(*) FROM pg_stat_activity WHERE backend_type='client backend' GROUP BY state,wait_event_type; COMMIT;")}, indent=2))
