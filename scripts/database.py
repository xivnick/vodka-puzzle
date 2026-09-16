"""Supabase management queries; credentials are read locally and never printed."""
import json, pathlib, urllib.request
PROJECT = 'hlhrzbylbwebtoytmmpd'
def query(sql):
    token=(pathlib.Path.home()/'.supabase/access-token').read_text().strip()
    req=urllib.request.Request(f'https://api.supabase.com/v1/projects/{PROJECT}/database/query', data=json.dumps({'query':sql}).encode(), headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as response: return json.load(response)
if __name__ == '__main__':
    import sys
    print(json.dumps(query(pathlib.Path(sys.argv[1]).read_text()),ensure_ascii=False,indent=2))
