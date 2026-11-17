"""Install the independent minute-by-minute monitor under the web-host account."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'xivnick@xivnick.me']
base = '/home/xivnick/vodka-puzzle/diagnostics'
subprocess.run(ssh + ['mkdir -p ' + base + ' && chmod 700 ' + base], check=True)
with (root / 'ops/monitor-request-health.py').open('rb') as source:
    subprocess.run(ssh + ['umask 077; cat > ' + base + '/monitor-request-health.py'], stdin=source, check=True)
subprocess.run(ssh + ['/usr/bin/python3 ' + base + '/monitor-request-health.py'], check=True)
install = r'''
import subprocess
base = '/home/xivnick/vodka-puzzle/diagnostics'
marker = '# vodka-puzzle-independent-health'
previous = subprocess.run(['crontab', '-l'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
if previous.returncode and 'no crontab' not in previous.stderr:
    raise SystemExit('Unable to read current crontab; left it unchanged')
lines = [line for line in previous.stdout.splitlines() if not line.endswith(marker)]
lines.append('* * * * * /usr/bin/python3 ' + base + '/monitor-request-health.py > ' + base + '/monitor-last-run.log 2>&1 ' + marker)
subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', universal_newlines=True, check=True)
print('Independent monitor installed: ' + base + '/health-logs/YYYY-MM-DD.jsonl')
'''
subprocess.run(ssh + ['python3 -'], input=install, text=True, check=True)
