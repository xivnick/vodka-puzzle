"""Install the minute-by-minute diagnostics under the web-host account."""
import argparse
from pathlib import Path
import shlex
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--metrics-token-file', type=Path,
                    help='project-scoped Supabase token with analytics_logs_read only')
args = parser.parse_args()
credential = args.metrics_token_file.read_text().strip() if args.metrics_token_file else None
if credential is not None and not credential.startswith('sbp_fc'):
    parser.error('web-host metrics require a scoped Supabase token (sbp_fc...)')

root = Path(__file__).resolve().parent.parent
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'xivnick@xivnick.me']
base = '/home/xivnick/vodka-puzzle/diagnostics'


def install(name, data):
    destination = shlex.quote(base + '/' + name)
    command = ('set -eu; umask 077; tmp=$(mktemp ' + base + '/.install.XXXXXX); '
               'trap \'rm -f "$tmp"\' EXIT; cat > "$tmp"; mv -f "$tmp" ' + destination)
    subprocess.run(ssh + [command], input=data, check=True)


subprocess.run(ssh + ['mkdir -p ' + base + ' && chmod 700 ' + base], check=True)
for script in ('monitor-request-health.py', 'supabase-resource-metrics.py'):
    install(script, (root / 'ops' / script).read_bytes())
if credential is not None:
    script = base + '/supabase-resource-metrics.py'
    command = ('set -eu; umask 077; tmp=$(mktemp ' + base + '/.token.XXXXXX); '
               'trap \'rm -f "$tmp"\' EXIT; cat > "$tmp"; '
               '/usr/bin/python3 ' + script + ' --token-file "$tmp" --log-dir '
               + base + '/resource-logs --require-metrics; mv -f "$tmp" ' + base + '/metrics-token')
    subprocess.run(ssh + [command], input=(credential + '\n').encode(), check=True)

subprocess.run(ssh + ['/usr/bin/python3 ' + base + '/monitor-request-health.py'], check=True)
install_cron = r'''
from pathlib import Path
import subprocess
base = '/home/xivnick/vodka-puzzle/diagnostics'
health_marker = '# vodka-puzzle-independent-health'
metrics_marker = '# vodka-puzzle-supabase-resources'
previous = subprocess.run(['crontab', '-l'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
if previous.returncode and 'no crontab' not in previous.stderr:
    raise SystemExit('Unable to read current crontab')
lines = [line for line in previous.stdout.splitlines() if not line.endswith((health_marker, metrics_marker))]
lines.append('* * * * * /usr/bin/python3 ' + base + '/monitor-request-health.py > ' + base + '/monitor-last-run.log 2>&1 ' + health_marker)
if Path(base, 'metrics-token').is_file():
    lines.append('* * * * * /usr/bin/python3 ' + base + '/supabase-resource-metrics.py --token-file ' + base + '/metrics-token --log-dir ' + base + '/resource-logs > ' + base + '/metrics-last-run.log 2>&1 ' + metrics_marker)
subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', universal_newlines=True, check=True)
print('Health logs: ' + base + '/health-logs/YYYY-MM-DD.jsonl')
print('Resource logs: ' + (base + '/resource-logs/YYYY-MM-DD.jsonl' if Path(base, 'metrics-token').is_file() else 'web-host token missing'))
'''
subprocess.run(ssh + ['python3 -'], input=install_cron, text=True, check=True)
