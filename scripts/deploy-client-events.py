"""Deploy only the credential-free diagnostics collector; never print the PAT."""
import json
import pathlib
import urllib.error
import urllib.request
import uuid
from database import PROJECT

root = pathlib.Path(__file__).resolve().parent.parent
token = (pathlib.Path.home() / '.supabase/access-token').read_text().strip()
boundary = 'vodka-' + uuid.uuid4().hex
metadata = json.dumps({'name': 'client-events', 'entrypoint_path': 'index.js', 'verify_jwt': False})
body = (
    f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n{metadata}\r\n'
    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.js"\r\nContent-Type: application/javascript\r\n\r\n'
).encode() + (root / 'supabase/functions/client-events/index.js').read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
request = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT}/functions/deploy?slug=client-events', data=body,
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + boundary})
try:
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.load(response)
    print(json.dumps({key: result.get(key) for key in ['slug', 'status', 'version', 'verify_jwt']}))
except urllib.error.HTTPError as error:
    raise SystemExit(f'Deployment failed: HTTP {error.code}: {error.read().decode()[:1000]}')
