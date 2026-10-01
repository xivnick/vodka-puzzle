"""Grant the explicitly designated, existing Google account puzzle management access."""
import re, sys
from database import query

if len(sys.argv)!=2 or not re.fullmatch(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',sys.argv[1].strip()):
    raise SystemExit('Usage: python3 scripts/set-puzzle-admin.py <Google email>')
email=sys.argv[1].strip().lower().replace("'","''")
sql=f"""
DO $$ DECLARE owner uuid; matches integer; BEGIN
 SELECT count(*),(array_agg(id))[1] INTO matches,owner FROM auth.users
 WHERE lower(email)='{email}' AND raw_app_meta_data->>'provider'='google';
 IF matches<>1 THEN RAISE EXCEPTION 'Exactly one existing Google account is required'; END IF;
 INSERT INTO private.puzzle_admins(user_id) VALUES(owner) ON CONFLICT DO NOTHING;
END $$;
"""
query(sql)
print('Designated Google account granted puzzle management access')
