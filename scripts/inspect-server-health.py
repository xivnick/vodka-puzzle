"""Read the website probes and Supabase resource history for the same UTC minutes."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import subprocess

UTC = dt.timezone.utc
KST = dt.timezone(dt.timedelta(hours=9))
LOCAL = Path.home() / '.local/state/vodka-puzzle/supabase-resources'
REMOTE = '/home/xivnick/vodka-puzzle/diagnostics'


def read_jsonl(lines):
    for line in lines:
        try:
            record = json.loads(line)
            stamp = dt.datetime.fromisoformat(record['at'])
        except (ValueError, KeyError):
            continue
        yield stamp, record


def read_remote(days):
    files = ' '.join(REMOTE + '/' + folder + '/' + day + '.jsonl'
                     for folder in ('health-logs', 'resource-logs') for day in days)
    command = 'for file in ' + files + '; do if test -r "$file"; then cat "$file"; fi; done'
    try:
        result = subprocess.run(
            ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'xivnick@xivnick.me', command],
            capture_output=True, text=True, timeout=25,
        )
    except (OSError, subprocess.TimeoutExpired):
        print('웹 서버 관측 기록 읽기 실패')
        return []
    if result.returncode:
        print('웹 서버 관측 기록 읽기 실패')
    return list(read_jsonl(result.stdout.splitlines()))


def resource_text(sample, previous, seconds):
    metrics = sample.get('metrics', {})
    if not metrics:
        return f"자원 {sample['status']}/{sample['error']}"
    parts = []
    if 0 < seconds <= 180 and metrics.get('node_boot_time_seconds') == previous.get('node_boot_time_seconds'):
        cpu = {name.split('/')[1]: value - previous[name] for name, value in metrics.items()
               if name.startswith('node_cpu_seconds_total/') and name in previous}
        total = sum(cpu.values())
        if total > 0 and min(cpu.values()) >= 0 and 'idle' in cpu:
            iowait = cpu.get('iowait', 0)
            parts.append(f"CPU {(total - cpu['idle'] - iowait) / total:.0%}, I/O 대기 {iowait / total:.0%}")
        disk = [(value - previous[name]) / seconds for name, value in metrics.items()
                if name.startswith('node_disk_io_time_seconds_total/') and name in previous
                and re.fullmatch(r'(nvme[0-9]+n[0-9]+|[xv]d[a-z]+|sd[a-z]+)', name.split('/')[1])
                and value >= previous[name]]
        if disk:
            parts.append(f'디스크 최대 사용률 {max(disk):.0%}')
    for mount, label in (('postgres', 'DB 디스크'), ('root', '루트 디스크')):
        available = metrics.get('node_filesystem_avail_bytes/' + mount)
        size = metrics.get('node_filesystem_size_bytes/' + mount)
        if available is not None and size:
            parts.append(f'{label} 여유 {available / size:.0%}')
    for name, label in (
        ('node_memory_MemAvailable_bytes', '가용 RAM'),
        ('node_memory_SwapFree_bytes', '가용 스왑'),
    ):
        if name in metrics:
            parts.append(f'{label} {metrics[name] / 1024 ** 2:.0f} MiB')
    for name, label in (
        ('node_load1', '부하'),
        ('node_vmstat_oom_kill', 'OOM 누적'),
        ('pg_up', 'DB up'),
        ('pg_stat_database_num_backends', 'DB 연결'),
        ('pgbouncer_pools_client_waiting_connections', '풀 대기'),
        ('pgbouncer_pools_client_maxwait_seconds', '풀 최대 대기(초)'),
    ):
        if name in metrics:
            parts.append(f'{label} {metrics[name]:g}')
    return ', '.join(parts) or '자원 지표 일부만 수집됨'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--minutes', type=int, default=30)
    parser.add_argument('--until', help='ISO 8601 with timezone, e.g. 2026-11-27T08:30:00+09:00')
    args = parser.parse_args()
    try:
        end = dt.datetime.fromisoformat(args.until.replace('Z', '+00:00')) if args.until else dt.datetime.now(UTC)
    except ValueError:
        parser.error('--until must be an ISO 8601 datetime')
    if end.tzinfo is None or not 1 <= args.minutes <= 1440:
        parser.error('use a timezone and a window of 1–1440 minutes')
    end = end.astimezone(UTC)
    start = end - dt.timedelta(minutes=args.minutes)
    days = [(start.date() + dt.timedelta(days=i)).isoformat()
            for i in range((end.date() - start.date()).days + 1)]
    rows = {}
    sources = [read_remote(days)]
    for day in days:
        file = LOCAL / (day + '.jsonl')
        if file.is_file():
            sources.append(read_jsonl(file.read_text().splitlines()))
    for source in sources:
        for stamp, record in source:
            if start <= stamp <= end:
                key = stamp.replace(second=0, microsecond=0)
                minute = rows.setdefault(key, {})
                prior = minute.get(record['kind'])
                if prior is None or (not prior[1].get('metrics') and record.get('metrics')):
                    minute[record['kind']] = (stamp, record)
    print(f'{start.astimezone(KST):%Y-%m-%d %H:%M}–{end.astimezone(KST):%m-%d %H:%M} KST')
    previous, last = {}, None
    for key in sorted(rows):
        minute = rows[key]
        health = minute.get('server_health', (None, {}))[1]
        probes = ' '.join(f"{s['endpoint']}={s['status'] or s['error']}/{s['duration_ms']}ms"
                          + (f"/{s['api_error_code']}" if s.get('api_error_code') else '')
                          + (f"/{s['cf_ray']}" if s['status'] >= 500 and s.get('cf_ray') else '')
                          + (f"/{s['request_id']}" if s['status'] >= 500 and s.get('request_id') else '')
                          for s in health.get('samples', []))
        stamp, sample = minute.get('supabase_resources', (None, {}))
        resource = resource_text(sample, previous, (stamp - last).total_seconds() if last else 0) if stamp else '자원 기록 없음'
        if sample.get('metrics'):
            previous, last = sample['metrics'], stamp
        print(f"{key.astimezone(KST):%m-%d %H:%M}  {probes or '요청 기록 없음'}  |  {resource}")
    if not rows:
        print('해당 시간에 기록이 없습니다.')


if __name__ == '__main__':
    main()
