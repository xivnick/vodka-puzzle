"""Exercise concurrent RPCs in an ephemeral local PostgreSQL cluster.
Uses the real cosmetic migrations with a minimal existing-service fixture.
Never connects to Supabase. Requires initdb, pg_ctl and psql on PATH.
"""
import json
import subprocess
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def run(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, check=True, **kwargs)

with tempfile.TemporaryDirectory(prefix='vp-cosmetic-', dir='/tmp') as temp:
    data = str(Path(temp) / 'data')
    run(['initdb', '-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run(['pg_ctl', '-D', data, '-l', str(Path(temp) / 'server.log'), '-o', f"-F -k {temp} -c listen_addresses='' -p 54329", '-w', 'start'])
    def sql(command):
        return run(['psql', '-X', '-h', temp, '-p', '54329', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], input=command).stdout.strip()
    def rpc(uid, command):
        claims = json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
        return sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{claims}'; {command}; COMMIT;")
    try:
        sql("""
        CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA extensions;
        CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
        CREATE TABLE auth.users(id uuid PRIMARY KEY);
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE TABLE public.semester_settings(id boolean PRIMARY KEY,active_season text);
        INSERT INTO public.semester_settings VALUES(true,'2026-2');
        CREATE TABLE public.semester_nicknames(season_id text,user_id uuid REFERENCES auth.users ON DELETE CASCADE,nickname text,PRIMARY KEY(season_id,user_id));
        CREATE TABLE public.puzzle_catalog(season_id text,puzzle_id text,title text,summary text,puzzle_type text,status text,published_at timestamptz,difficulty text,sort_order integer DEFAULT 0,updated_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(season_id,puzzle_id));
        CREATE TABLE public.semester_completions(season_id text,puzzle_id text,user_id uuid REFERENCES auth.users ON DELETE CASCADE,nickname text,completed_at timestamptz,excluded boolean DEFAULT false);
        CREATE TABLE public.daily_sudoku_completions(day date,user_id uuid REFERENCES auth.users ON DELETE CASCADE,season_id text,nickname text,rank bigint,completed_at timestamptz,excluded boolean DEFAULT false);
        CREATE TABLE private.time_machine_openings(user_id uuid REFERENCES auth.users ON DELETE CASCADE,day date,opened_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(user_id,day));
        CREATE TABLE private.time_machine_wallets(user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,balance integer CHECK(balance>=0),updated_at timestamptz DEFAULT clock_timestamp());
        CREATE TABLE private.time_machine_ticket_events(user_id uuid REFERENCES auth.users ON DELETE CASCADE,event_key text,delta integer CHECK(delta IN(-1,1)),balance_after integer CHECK(balance_after>=0),day date,created_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(user_id,event_key),CHECK((delta=1 AND day IS NULL) OR(delta=-1 AND day IS NOT NULL)));
        """)
        streak = (ROOT / 'supabase/migrations/20260919_daily_streak.sql').read_text()
        sql(streak[streak.index('CREATE OR REPLACE FUNCTION private.calculate_daily_streak'):streak.index('CREATE OR REPLACE FUNCTION public.daily_sudoku_context')])
        ticket = (ROOT / 'supabase/migrations/20261011_time_machine.sql').read_text()
        sql(ticket[ticket.index('CREATE FUNCTION private.ensure_time_machine_wallet'):ticket.index('CREATE FUNCTION public.time_machine_context')])
        sql("""ALTER TABLE public.puzzle_catalog ADD CONSTRAINT puzzle_catalog_difficulty_check CHECK(difficulty IS NULL OR char_length(difficulty)>0);
        CREATE FUNCTION public.admin_update_puzzle(requested_season text,requested_puzzle text,new_title text,new_summary text,new_type text,new_status text,new_published_at timestamptz,new_sort_order integer,expected_updated_at timestamptz,new_difficulty text) RETURNS public.puzzle_catalog LANGUAGE sql AS $$ SELECT NULL::public.puzzle_catalog $$;""")
        for name in ['20261105_cosmetic_foundation.sql', '20261105_cosmetic_service.sql', '20261105_numeric_difficulty.sql', '20261106_all_clear_effect.sql','20261106_achievement_repeat_rewards.sql','20261106_time_traveler_mission.sql','20261106_time_traveler_clock_bolt.sql']:
            sql((ROOT / 'supabase/migrations' / name).read_text())
        sql("UPDATE private.cosmetic_settings SET enabled=true,history_policy='all_records',champion_tickets=1; UPDATE private.cosmetic_draw_configs SET status='active',price_per_draw=100;")
        users = [str(uuid.uuid4()) for _ in range(8)]
        for uid in users:
            sql(f"INSERT INTO auth.users VALUES('{uid}'); INSERT INTO public.semester_nicknames VALUES('2026-2','{uid}','test');")
        def provision(uid, coins=0, materials=False, cosmetics=False):
            claims = json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
            sql(f"""BEGIN; SET LOCAL request.jwt.claims='{claims}';
            DO $$ DECLARE op private.account_operations; BEGIN
            op:=private.begin_cosmetic_operation(gen_random_uuid(),'adjustment','{{}}');
            {f"PERFORM private.change_cosmetic_coins(op.id,{coins},'test');" if coins else ''}
            {"PERFORM private.change_cosmetic_inventory(op.id,'common:c0',2,'test'); PERFORM private.change_cosmetic_inventory(op.id,'common:c1',1,'test');" if materials else ''}
            {"PERFORM private.change_cosmetic_inventory(op.id,'rare:r-berry',1,'test'); PERFORM private.change_cosmetic_inventory(op.id,'effect:ribbon',1,'test');" if cosmetics else ''}
            PERFORM private.finish_cosmetic_operation(op.id,'{{}}'); END $$; COMMIT;""")
        def parallel(commands):
            def call(args):
                uid, command = args
                try:
                    return json.loads(rpc(uid, command))
                except subprocess.CalledProcessError as error:
                    if 'INSUFFICIENT_COINS' in error.stderr: return 'INSUFFICIENT_COINS'
                    if 'INSUFFICIENT_MATERIALS' in error.stderr: return 'INSUFFICIENT_MATERIALS'
                    raise RuntimeError(error.stderr) from error
            with ThreadPoolExecutor(max_workers=len(commands)) as pool:
                return list(pool.map(call, commands))
        a,b,c,d,e,f,g,h = users
        provision(a,100)
        results = parallel([(a,'SELECT public.draw_cosmetics(gen_random_uuid(),1,1)')]*2)
        assert sum(isinstance(r,dict) for r in results)==1 and results.count('INSUFFICIENT_COINS')==1, results
        provision(b,100)
        request = str(uuid.uuid4())
        results = parallel([(b,f"SELECT public.draw_cosmetics('{request}',1,1)")]*2)
        assert results[0]==results[1] and results[0]['progress']['draw_count']==1, results
        provision(c,10000)
        results = parallel([(c,'SELECT public.draw_cosmetics(gen_random_uuid(),1,1)')]*3+[(c,'SELECT public.draw_cosmetics(gen_random_uuid(),1,10)')])
        assert sorted(r['state_revision'] for r in results)==[2,3,4,5]
        assert sql(f"SELECT count(*) FROM private.cosmetic_results r JOIN private.account_operations o ON o.id=r.operation_id WHERE o.user_id='{c}'")=='13'
        for uid in [d,e,f]: provision(uid,materials=True)
        results = parallel([(uid,"SELECT public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c0','common:c0','common:c1'])") for uid in [d,e]])
        assert results[0]['results'][0]['item_id']==results[1]['results'][0]['item_id']=='uncommon:common:c0:common:c1'
        results = parallel([(f,"SELECT public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c0','common:c0','common:c1'])")]*2)
        assert sum(isinstance(r,dict) for r in results)==1 and results.count('INSUFFICIENT_MATERIALS')==1, results
        sql(f"""INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty) VALUES('2026-2','test','test','summary','test','published',now()-interval '1 day',1);
        INSERT INTO public.semester_completions VALUES('2026-2','test','{g}','test',now(),false);""")
        results = parallel([(g,"SELECT public.claim_achievement(gen_random_uuid(),'first','season:2026-2',1)")]*2)
        assert sorted(r['already_claimed'] for r in results)==[False,True]
        assert sql(f"SELECT count(*) FROM private.mission_claims WHERE user_id='{g}'")=='1'
        context = json.loads(rpc(g,'SELECT public.cosmetic_context()'))
        assert context['state']['all_clear']['eligible'] and not context['state']['all_clear']['enabled']
        version=context['state']['equipment']['equipment_version']
        result=json.loads(rpc(g,f'SELECT public.set_all_clear_effect({version},true)'))
        assert result['state']['all_clear']['active']
        provision(g,cosmetics=True)
        version=result['state']['equipment']['equipment_version']
        result=json.loads(rpc(g,f"SELECT public.set_cosmetic_equipment({version},'{{\"icon_id\":\"icon:leaf\",\"color_id\":\"rare:r-berry\",\"effect_id\":\"effect:ribbon\"}}')"))
        assert result['state']['all_clear']['active'] and result['state']['equipment']['effect_id']=='effect:ribbon'
        sql("INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty) VALUES('2026-2','later','later','summary','test','published',now(),0)")
        context = json.loads(rpc(g,'SELECT public.achievement_context()'))
        assert not any(r['id']=='all' for r in context['achievements'])
        assert context['state']['all_clear']['enabled'] and not context['state']['all_clear']['active']
        sql(f"INSERT INTO public.semester_completions VALUES('2026-2','later','{g}','test',now(),false)")
        assert json.loads(rpc(g,'SELECT public.cosmetic_context()'))['state']['all_clear']['active']

        sql(f"INSERT INTO public.daily_sudoku_completions VALUES((now() AT TIME ZONE 'Asia/Seoul')::date,'{h}','2026-2','test',1,now(),false)")
        results = parallel([(h,"SELECT public.claim_daily_task(gen_random_uuid(),'daily-champion',(now() AT TIME ZONE 'Asia/Seoul')::date)")]*2)
        assert sorted(r['already_claimed'] for r in results)==[False,True]
        assert sql(f"SELECT balance FROM private.time_machine_wallets WHERE user_id='{h}'")=='2'
        # Newly configured fixed/random/ticket repeats use real record-derived progress.
        fixed, lucky, streak_user = [str(uuid.uuid4()) for _ in range(3)]
        for uid in [fixed,lucky,streak_user]:
            sql(f"INSERT INTO auth.users VALUES('{uid}'); INSERT INTO public.semester_nicknames VALUES('2026-2','{uid}','reward_test');")
        sql(f"""INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty)
          SELECT '2026-2','reward_'||i,'test','summary','test','published',now()-interval '1 day',(i-1)/20+1 FROM generate_series(1,60) i;
          INSERT INTO public.semester_completions SELECT '2026-2','reward_'||i,'{fixed}','reward_test',now(),false FROM generate_series(1,60) i;""")
        for mission,amount in [('regular',100),('easy',30),('medium',60),('hard',90)]:
            icon=json.loads(rpc(fixed,f"SELECT public.claim_achievement(gen_random_uuid(),'{mission}','season:2026-2',10)"))
            assert 'coins' not in icon['reward']
            payout=json.loads(rpc(fixed,f"SELECT public.claim_achievement(gen_random_uuid(),'{mission}','season:2026-2',20)"))
            assert payout['reward']['coins']==amount
        assert sql(f"SELECT balance FROM private.account_coin_wallets WHERE user_id='{fixed}'")=='280'
        provision(lucky,coins=10000)
        rpc(lucky,'SELECT public.draw_cosmetics(gen_random_uuid(),1,10)')
        rpc(lucky,"SELECT public.claim_achievement(gen_random_uuid(),'feature-draw','account',5)")
        request=str(uuid.uuid4())
        command=f"SELECT public.claim_achievement('{request}','feature-draw','account',10)"
        results=parallel([(lucky,command)]*2)
        assert results[0]==results[1]
        assert results[0]['reward']['coins'] in range(10,101,10)
        stored=json.loads(sql(f"SELECT reward FROM private.mission_claims WHERE user_id='{lucky}' AND mission_id='feature-draw' AND threshold=10"))
        assert stored==results[0]['reward'] and 'coin_options' not in stored
        assert json.loads(rpc(lucky,"SELECT public.claim_achievement(gen_random_uuid(),'feature-draw','account',10)"))['already_claimed']
        sql(f"INSERT INTO public.daily_sudoku_completions SELECT (now() AT TIME ZONE 'Asia/Seoul')::date-i,'{streak_user}','2026-2','reward_test',99,now(),false FROM generate_series(0,29) i")
        rpc(streak_user,"SELECT public.claim_achievement(gen_random_uuid(),'daily','account',7)")
        context=json.loads(rpc(streak_user,'SELECT public.achievement_context()'))
        daily=next(row for row in context['achievements'] if row['id']=='daily')
        assert daily['threshold']==30 and daily['reward']=={'tickets':1}
        results=parallel([(streak_user,"SELECT public.claim_achievement(gen_random_uuid(),'daily','account',30)")]*2)
        assert sorted(r['already_claimed'] for r in results)==[False,True]
        assert sql(f"SELECT balance FROM private.time_machine_wallets WHERE user_id='{streak_user}'")=='2'
        context=json.loads(rpc(streak_user,'SELECT public.achievement_context()'))
        daily=next(row for row in context['achievements'] if row['id']=='daily')
        assert daily['threshold']==60 and daily['state']=='in_progress'
        notices=json.loads(sql("SELECT private.achievement_milestone_diff('{\"daily\":7}','{\"daily\":90}')"))
        assert [n['threshold'] for n in notices if n['id']=='daily']==[30,60,90]
        # The mission derives only existing unique openings, not ticket awards or page visits.
        traveler=str(uuid.uuid4())
        sql(f"INSERT INTO auth.users VALUES('{traveler}'); INSERT INTO public.semester_nicknames VALUES('2026-2','{traveler}','traveler');")
        assert any(r['id']=='time-traveler' and r['current']==0 for r in json.loads(rpc(traveler,'SELECT public.achievement_context()'))['achievements'])
        assert sql("SELECT definition->>'src' FROM private.cosmetic_items WHERE id='icon:time-traveler'")=='/icons/achievement-preview/clock-bolt.svg'
        sql("UPDATE private.cosmetic_items SET active=true WHERE id='icon:time-traveler'; UPDATE private.achievement_rules SET active=true WHERE id='time-traveler';")
        sql(f"INSERT INTO private.time_machine_openings SELECT '{traveler}',current_date-i,now() FROM generate_series(1,2) i")
        ctx=json.loads(rpc(traveler,'SELECT public.achievement_context()'))
        row=next(r for r in ctx['achievements'] if r['id']=='time-traveler')
        assert row['current']==2 and row['threshold']==3 and row['scope_key']=='account' and row['state']=='in_progress'
        sql(f"INSERT INTO private.time_machine_openings VALUES('{traveler}',current_date-1,now()) ON CONFLICT DO NOTHING")
        assert json.loads(rpc(traveler,'SELECT public.cosmetic_context()'))['progress']['time_machine_count']==2
        sql(f"INSERT INTO private.time_machine_openings VALUES('{traveler}',current_date-3,now())")
        results=parallel([(traveler,"SELECT public.claim_achievement(gen_random_uuid(),'time-traveler','account',3)")]*2)
        assert sorted(r['already_claimed'] for r in results)==[False,True]
        assert next(r for r in results if not r['already_claimed'])['reward']=={'item_id':'icon:time-traveler'}
        ctx=json.loads(rpc(traveler,'SELECT public.achievement_context()'))
        row=next(r for r in ctx['achievements'] if r['id']=='time-traveler')
        assert row['state']=='completed' and row['threshold'] is None
        assert json.loads(rpc(lucky,'SELECT public.cosmetic_context()'))['progress']['time_machine_count']==0
        assert sql("""SELECT count(*) FROM private.account_coin_wallets w WHERE balance<>coalesce((SELECT sum(delta) FROM private.coin_ledger l WHERE l.user_id=w.user_id),0)""")=='0'
        assert sql("""SELECT count(*) FROM (SELECT user_id,item_id,sum(delta) AS quantity FROM private.inventory_ledger GROUP BY user_id,item_id) l WHERE quantity<>coalesce((SELECT quantity FROM private.cosmetic_inventory i WHERE i.user_id=l.user_id AND i.item_id=l.item_id),0)""")=='0'
        assert sql("SELECT count(*) FROM private.account_operations WHERE status<>'completed'")=='0'
        print('Concurrent RPCs passed: overspend, request replay, rapid 1/10 draws, shared craft creation, material contention, duplicate mission/ticket claims, revision ordering and ledger audit.')
    finally:
        run(['pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])
