"""Save private data and schema metadata outside the web and Git directories."""
import pathlib,json,datetime,subprocess
from database import query
root=pathlib.Path.home()/'Documents/Backups/vodka-puzzle'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
root.mkdir(parents=True,mode=0o700)
# Single statement gives the three tables a consistent snapshot.
sql="""select jsonb_build_object(
'data',jsonb_build_object('nicknames',(select coalesce(jsonb_agg(t),'[]') from public.nicknames t),'completions',(select coalesce(jsonb_agg(t),'[]') from public.completions t),'progress',(select coalesce(jsonb_agg(t),'[]') from public.progress t)),
'columns',(select jsonb_agg(c) from information_schema.columns c where table_schema='public'),
'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where connamespace='public'::regnamespace),
'policies',(select jsonb_agg(p) from pg_policies p where schemaname='public'),
'indexes',(select jsonb_agg(i) from pg_indexes i where schemaname='public'),
'grants',(select jsonb_agg(g) from information_schema.role_table_grants g where table_schema='public'),
'rls',(select jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity)) from pg_class where relnamespace='public'::regnamespace and relkind='r')) as backup"""
b=query(sql)[0]['backup']
f=root/'database.json';f.write_text(json.dumps(b,ensure_ascii=False,indent=2));f.chmod(0o600)
subprocess.run(['git','archive','--format=tar.gz','-o',str(root/'source.tar.gz'),'HEAD'],cwd=pathlib.Path(__file__).resolve().parent.parent,check=True)
print(root)
