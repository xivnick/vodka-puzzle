"""Run from cron on the web host; write health samples without using Supabase logs.

Python 3.6+, standard library only. No management token or user credentials.
"""
import concurrent.futures
import datetime
import fcntl
import json
import os
from pathlib import Path
import socket
import time
import urllib.error
import urllib.request

API = 'https://hlhrzbylbwebtoytmmpd.supabase.co'
KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y'


def probe(name, url, body=None):
    started = time.monotonic()
    result = {'endpoint': name, 'status': 0, 'error': 'none'}
    headers = {'Content-Type': 'application/json', 'apikey': KEY,
               'x-client-info': 'vodka-health-monitor/1'} if url.startswith(API) else {}
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            # These endpoints have bounded, small responses. Do not store their bodies.
            response.read(262144)
            result['status'] = response.status
            result['request_id'] = response.headers.get('sb-request-id', '')
    except urllib.error.HTTPError as error:
        result.update(status=error.code, error='http')
    except (socket.timeout, TimeoutError):
        result['error'] = 'timeout'
    except urllib.error.URLError as error:
        result['error'] = 'timeout' if isinstance(error.reason, socket.timeout) else 'connection'
    except Exception:
        result['error'] = 'unexpected'
    result['duration_ms'] = round((time.monotonic() - started) * 1000)
    return result


def main():
    os.umask(0o077)
    directory = Path(__file__).resolve().parent / 'health-logs'
    directory.mkdir(mode=0o700, exist_ok=True)
    with (directory / 'monitor.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        now = datetime.datetime.now(datetime.timezone.utc)
        jobs = [('site', 'https://puzzle.xivnick.me/diagnostics/ping.json', None),
                ('auth', API + '/auth/v1/health', None),
                ('database', API + '/rest/v1/rpc/daily_sudoku_summary', {})]
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            samples = list(pool.map(lambda args: probe(*args), jobs))
        record = {'kind': 'server_health', 'at': now.isoformat(), 'samples': samples}
        with (directory / (now.strftime('%Y-%m-%d') + '.jsonl')).open('a') as stream:
            stream.write(json.dumps(record, separators=(',', ':')) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        # Delete only this monitor's daily files, retaining the last 30 UTC dates.
        cutoff = (now.date() - datetime.timedelta(days=29)).isoformat()
        for file in directory.glob('????-??-??.jsonl'):
            if file.stem < cutoff:
                file.unlink()


if __name__ == '__main__':
    main()
