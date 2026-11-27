"""Run from cron on the web host; write health samples without using Supabase logs.

Python 3.6+, standard library only. No management token or user credentials.
"""
import concurrent.futures
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import time
import urllib.error
import urllib.request

API = 'https://hlhrzbylbwebtoytmmpd.supabase.co'
KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y'


def record_headers(result, headers):
    for field, header, pattern in (
        ('request_id', 'sb-request-id', r'[a-fA-F0-9-]{1,40}'),
        ('cf_ray', 'cf-ray', r'[a-fA-F0-9]{8,32}-[A-Z]{3}'),
    ):
        value = headers.get(header, '')
        if re.fullmatch(pattern, value):
            result[field] = value


def probe(name, url, body=None):
    started = time.monotonic()
    result = {'endpoint': name, 'status': 0, 'error': 'none'}
    headers = {'Content-Type': 'application/json', 'apikey': KEY,
               'x-client-info': 'vodka-health-monitor/1'} if url.startswith(API) else {}
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                     headers=headers)
    try:
        # Allow time for Cloudflare to return its upstream connection error.
        with urllib.request.urlopen(request, timeout=23 if url.startswith(API) else 12) as response:
            # These endpoints have bounded, small responses. Do not store their bodies.
            response.read(262144)
            result['status'] = response.status
            record_headers(result, response.headers)
    except urllib.error.HTTPError as error:
        result.update(status=error.code, error='http')
        record_headers(result, error.headers)
        if error.code == 503 and name == 'database':
            try:
                payload = json.loads(error.read(4096).decode())
                code = payload.get('code', '') if isinstance(payload, dict) else ''
                if isinstance(code, str) and re.fullmatch(r'PGRST[0-9]{3}', code):
                    result['api_error_code'] = code
            except (OSError, ValueError):
                pass
    except (socket.timeout, TimeoutError):
        result['error'] = 'timeout'
    except urllib.error.URLError as error:
        if isinstance(error.reason, socket.timeout):
            result['error'] = 'timeout'
        elif isinstance(error.reason, socket.gaierror):
            result['error'] = 'dns'
        else:
            result['error'] = 'connection'
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
