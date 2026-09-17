"""Upload a locally verified static build outside ~/www, then switch atomically."""
from pathlib import Path
import datetime
import shlex
import subprocess
import uuid

root = Path(__file__).resolve().parent.parent
build = root / 'dist'
if not (build / 'index.html').is_file():
    raise SystemExit('Missing dist/index.html; run npm run build first.')
for file in build.rglob('*'):
    if file.is_symlink() or file.name.startswith('.'):
        raise SystemExit(f'Unexpected build entry: {file}')
subprocess.run(['npm', 'test'], cwd=root, check=True)
subprocess.run(['python3', 'scripts/sync-puzzle-catalog.py'], cwd=root, check=True)
host = 'xivnick@xivnick.me'
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
base = '/home/xivnick/vodka-puzzle'
destination = f'{base}/releases/{release}'
subprocess.run(ssh + [host, f'mkdir -p {shlex.quote(destination)}'], check=True)
subprocess.run(['rsync', '-rtp', '--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r', '-e', shlex.join(ssh), '--', str(build) + '/', host + ':' + destination + '/'], check=True)
# Each upload gets a new directory; old releases remain available for rollback.
link = f'{base}/dist-next-{release}'
subprocess.run(ssh + [host, f'test -s {destination}/index.html && ln -s releases/{release} {link} && mv -Tf {link} {base}/dist'], check=True)
print(f'Uploaded {destination}')
print('https://puzzle.xivnick.me/')
