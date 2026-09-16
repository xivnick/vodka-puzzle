"""Create a self-contained archive from the legacy files and a private DB backup."""
import pathlib,json,re,shutil,sys,tarfile,tempfile
root=pathlib.Path(__file__).resolve().parent.parent
backup=json.loads((pathlib.Path(sys.argv[1])/'database.json').read_text())
dest=root/'public/archive/2026-1';dest.mkdir(parents=True,exist_ok=True)
base='/puzzle/archive/2026-1/'
source = pathlib.Path(tempfile.mkdtemp(prefix='puzzle-archive-'))
with tarfile.open(pathlib.Path(sys.argv[1])/'source.tar.gz') as tar: tar.extractall(source)
folders=[p for p in source.iterdir() if p.is_dir() and (re.fullmatch(r'\d{6}_\d{2}',p.name) or p.name in ['puzzle_test','tmp_01','css','js','img','data'])]
for p in folders: shutil.copytree(p,dest/p.name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.DS_Store'))
shutil.copy2(source/'index.html',dest/'index.html')
if (source/'test.html').exists(): shutil.copy2(source/'test.html',dest/'test.html')
for p in dest.rglob('*.html'):
 s=p.read_text().replace('/puzzle/',base)
 s=re.sub(r'<a class="header-nick-link"[^>]*>.*?</a>','<a class="header-nick-link" href="/puzzle/">이번 학기</a>',s,flags=re.S)
 s=s.replace('</header>','</header><p class="archive-notice">2026년 1학기 아카이브 · 기록 저장 종료</p>')
 s=s.replace('`puzzle_${', '`archive:2026-1:puzzle_${')
 s=s.replace('</head>','<style>.archive-notice{font-size:14px;color:#777;text-align:center;margin:8px 12px 20px}#cloudBtns{display:none!important}</style></head>')
 # Direct storage users also get isolated archive keys.
 s=re.sub(r"(['\"])(puzzle_[A-Za-z0-9_]+)\1",lambda m:m[1]+'archive:2026-1:'+m[2]+m[1],s)
 p.write_text(s)
common=(dest/'js/common.js').read_text().replace('/puzzle/',base)
# Remove all network-backed database helpers and write paths.
def replace_fn(name,body,async_=False):
 global common
 pattern=re.compile(r'(?:async )?function '+name+r'\([^\n]*\) \{')
 m=pattern.search(common);assert m,name
 start=m.start();i=m.end();depth=1;quote=None;escape=False
 # Functions end at a line-leading closing brace in this legacy file.
 end=common.index('\n}',i)+2
 common=common[:start]+body+common[end:]
replace_fn('sbSelect', '''let archiveRowsPromise;
async function sbSelect(table, qs = '') {
  if (table !== 'completions') return [];
  archiveRowsPromise ||= fetch('/puzzle/archive/2026-1/records.json').then(r => { if (!r.ok) throw new Error('기록을 불러오지 못했습니다.'); return r.json(); });
  let rows = [...await archiveRowsPromise];
  const params = new URLSearchParams(qs);
  for (const field of ['nickname','puzzle_id']) {
    const value = params.get(field);
    if (value?.startsWith('eq.')) rows = rows.filter(row => row[field] === value.slice(3));
  }
  const order = params.get('order');
  if (order) { const [field, direction] = order.split('.'); rows.sort((a,b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1)); }
  const limit = params.get('limit');
  return limit ? rows.slice(0, Number(limit)) : rows;
}''')
for name,body in {
 'sbInsert':"async function sbInsert() { throw new Error('아카이브는 읽기 전용입니다.'); }",
 'sbUpsert':"async function sbUpsert() { throw new Error('아카이브는 읽기 전용입니다.'); }",
 'registerNickname':"async function registerNickname() {}",
 'getNickname':"function getNickname() { return ''; }",
 'setNickname':"function setNickname() {}",
 'initHeader':"function initHeader() {}",
 'initRecentBanner':"function initRecentBanner() {}",
 'startRecentBannerPolling':"function startRecentBannerPolling() {}",
 'recordCompletion':"async function recordCompletion() { showToast('완성했습니다! 아카이브 기록에는 반영되지 않습니다.'); }",
 'resetCompletion':"function resetCompletion() {}",
 'saveProgressCloud':"async function saveProgressCloud() {}",
 'loadProgressCloud':"async function loadProgressCloud() { return null; }",
}.items(): replace_fn(name,body)
common=re.sub(r"const SUPABASE_(?:URL|ANON_KEY) = .*;\n",'',common)
(dest/'js/common.js').write_text(common)
records=[{k:r[k] for k in ['nickname','puzzle_id','completed_at']} for r in backup['data']['completions']]
(dest/'records.json').write_text(json.dumps(records,ensure_ascii=False))
(dest/'snapshot.json').write_text(json.dumps({'season':'2026-1','records':len(records),'snapshot':pathlib.Path(sys.argv[1]).name},ensure_ascii=False))
print(f'Archived {len(folders)} directories and {len(records)} completions')

shutil.rmtree(source)
