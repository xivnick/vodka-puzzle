"""Deploy the notification sender and install its Supabase cron job."""
import hmac
import json
import pathlib
import secrets
import time
import urllib.error
import urllib.request
import uuid

from database import PROJECT, query

root = pathlib.Path(__file__).resolve().parent.parent
token = (pathlib.Path.home() / '.supabase/access-token').read_text().strip()
api = f'https://api.supabase.com/v1/projects/{PROJECT}'
slug = 'puzzle-push-test'
endpoint = f'https://{PROJECT}.supabase.co/functions/v1/{slug}'


def management(path, data, content_type):
    request = urllib.request.Request(api + path, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': content_type,
    })
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Supabase request failed for {path} (HTTP {error.code})') from None


def vault_secret(name):
    rows = query(f"select decrypted_secret from vault.decrypted_secrets where name = '{name}'")
    return rows[0]['decrypted_secret'] if rows else None


if not query("select to_regprocedure('private.tick_puzzle_notifications()') is not null as ready")[0]['ready']:
    raise SystemExit('Apply the notification dispatch migration first.')

secret = vault_secret('puzzle_notification_dispatch_token')
if not secret:
    secret = secrets.token_urlsafe(32)
    query(f"select vault.create_secret('{secret}', 'puzzle_notification_dispatch_token')")
existing_endpoint = vault_secret('puzzle_notification_endpoint')
if not existing_endpoint:
    query(f"select vault.create_secret('{endpoint}', 'puzzle_notification_endpoint')")
elif existing_endpoint != endpoint:
    query(f"""select vault.update_secret(id, new_secret := '{endpoint}') from vault.secrets
              where name = 'puzzle_notification_endpoint'""")

management('/secrets', json.dumps([
    {'name': 'PUZZLE_NOTIFICATION_DISPATCH_TOKEN', 'value': secret},
]).encode(), 'application/json')

boundary = 'vodka-' + uuid.uuid4().hex
metadata = json.dumps({'name': slug, 'entrypoint_path': 'index.js', 'verify_jwt': False})
data = (
    f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n'
    f'Content-Type: application/json\r\n\r\n{metadata}\r\n'
    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.js"\r\n'
    'Content-Type: application/javascript\r\n\r\n'
).encode() + (root / f'supabase/functions/{slug}/index.js').read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
result = management(f'/functions/deploy?slug={slug}', data, f'multipart/form-data; boundary={boundary}')
if result.get('slug') != slug or result.get('status') != 'ACTIVE':
    raise SystemExit('The notification Edge Function is not active.')

issued = str(int(time.time()))
signature = hmac.new(secret.encode(), issued.encode(), 'sha256').hexdigest()
request = urllib.request.Request(endpoint, data=b'{"action":"dispatch"}', headers={
    'Authorization': f'Bearer {issued}.{signature}', 'Content-Type': 'application/json',
})
try:
    with urllib.request.urlopen(request, timeout=55) as response:
        counts = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f'Dispatch check failed (HTTP {error.code})') from None
if 'sent' not in counts:
    raise SystemExit('The dispatcher returned an unexpected response.')

query("select cron.schedule('vodka-puzzle-notifications', '* * * * *', 'select private.tick_puzzle_notifications()')")
print(json.dumps({'function_version': result['version'], 'dispatcher_check': counts,
                  'cron_job': 'vodka-puzzle-notifications'}))
