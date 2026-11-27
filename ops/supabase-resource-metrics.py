"""Keep a history of Supabase metrics outside the project being monitored."""
import argparse
import collections
import datetime
import fcntl
import json
import math
import os
from pathlib import Path
import re
import socket
import time
import urllib.error
import urllib.request

PROJECT = 'hlhrzbylbwebtoytmmpd'
URL = 'https://api.supabase.com/v1/projects/' + PROJECT + '/analytics/endpoints/metrics'
SCALARS = set("""
node_boot_time_seconds node_load1 node_load5 node_load15 node_procs_blocked
node_memory_MemAvailable_bytes node_memory_MemTotal_bytes
node_memory_SwapFree_bytes node_memory_SwapTotal_bytes
node_vmstat_oom_kill node_vmstat_pgmajfault node_vmstat_pswpin node_vmstat_pswpout
pg_up pg_status_in_recovery pg_exporter_last_scrape_error
pg_stat_statements_total_queries pg_stat_statements_total_time_seconds
pgbouncer_up pgbouncer_used_clients pgbouncer_config_max_client_connections
""".split())
COUNTERS = {
    'node_cpu_seconds_total': ('mode', 'user|nice|system|idle|iowait|irq|softirq|steal'),
    'node_disk_io_time_seconds_total': ('device', '[a-zA-Z0-9_-]{1,32}'),
    'node_disk_io_time_weighted_seconds_total': ('device', '[a-zA-Z0-9_-]{1,32}'),
    'node_disk_read_bytes_total': ('device', '[a-zA-Z0-9_-]{1,32}'),
    'node_disk_written_bytes_total': ('device', '[a-zA-Z0-9_-]{1,32}'),
}
SUMS = set("""
pg_stat_database_num_backends pg_stat_database_deadlocks_total
pg_stat_database_temp_bytes_total pgbouncer_pools_client_waiting_connections
""".split())
MAXIMA = {'pgbouncer_pools_client_maxwait_seconds'}
FILESYSTEM = {'node_filesystem_avail_bytes', 'node_filesystem_size_bytes'}
LINE = re.compile(r'^([a-zA-Z0-9_:]+)(?:\{(.*)\})?\s+(\S+)(?:\s+\S+)?$')


def parse_metrics(body):
    series = collections.defaultdict(list)
    for line in body.splitlines():
        match = LINE.fullmatch(line)
        if not match:
            continue
        name, labels, raw = match.groups()
        if name in COUNTERS:
            label, pattern = COUNTERS[name]
            tag = re.search(r'(?:^|,)' + label + r'="(' + pattern + r')"(?=,|$)', labels or '')
            if not tag:
                continue
            name += '/' + tag.group(1)
        elif name in FILESYSTEM:
            mount = re.search(r'(?:^|,)mountpoint="(/|/var/lib/postgresql/data)"(?=,|$)', labels or '')
            if not mount:
                continue
            name += '/root' if mount.group(1) == '/' else '/postgres'
        elif name not in SCALARS | SUMS | MAXIMA:
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        if math.isfinite(value):
            series[name].append(value)
    return {
        name: max(values) if name in MAXIMA else sum(values)
        for name, values in series.items()
        if len(values) == 1 or name not in SCALARS
    }


def collect(token_path):
    started = time.monotonic()
    sample = {'status': 0, 'error': 'none'}
    try:
        token = token_path.read_text().strip()
        if not token:
            raise ValueError('missing token')
        request = urllib.request.Request(URL, headers={'Authorization': 'Bearer ' + token})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            sample['status'] = response.status
            body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            sample['error'] = 'response_too_large'
        else:
            sample['metrics'] = parse_metrics(body.decode())
            if not sample['metrics']:
                sample['error'] = 'empty_metrics'
    except urllib.error.HTTPError as error:
        sample.update(status=error.code, error='http')
    except (socket.timeout, TimeoutError):
        sample['error'] = 'timeout'
    except urllib.error.URLError as error:
        sample['error'] = 'timeout' if isinstance(error.reason, socket.timeout) else 'connection'
    except (OSError, ValueError):
        sample['error'] = 'configuration_or_response'
    sample['duration_ms'] = round((time.monotonic() - started) * 1000)
    return sample


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--log-dir', type=Path, required=True)
    parser.add_argument('--require-metrics', action='store_true')
    args = parser.parse_args()

    os.umask(0o077)
    args.log_dir.mkdir(parents=True, exist_ok=True)
    with (args.log_dir / 'collector.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX if args.require_metrics else fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        now = datetime.datetime.now(datetime.timezone.utc)
        sample = collect(args.token_file)
        record = {'kind': 'supabase_resources', 'at': now.isoformat(), **sample}
        with (args.log_dir / (now.strftime('%Y-%m-%d') + '.jsonl')).open('a') as stream:
            stream.write(json.dumps(record, separators=(',', ':'), allow_nan=False) + '\n')
        cutoff = (now.date() - datetime.timedelta(days=29)).isoformat()
        for file in args.log_dir.glob('????-??-??.jsonl'):
            if file.stem < cutoff:
                file.unlink()
        if args.require_metrics and not sample.get('metrics'):
            parser.exit(1, f"Metrics check failed: {sample['status']}/{sample['error']}\n")


if __name__ == '__main__':
    main()
