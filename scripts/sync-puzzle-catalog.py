"""Register newly deployed pages as test puzzles; never overwrite managed metadata."""
import json, re
from pathlib import Path
from database import query
root=Path(__file__).resolve().parent.parent
puzzles=json.loads((root/'src/data/puzzles.json').read_text())
def literal(value): return "'"+value.replace("'","''")+"'"
values=[]
for puzzle in puzzles:
    puzzle_id=puzzle['id']
    if not re.fullmatch(r'\d{6}_\d{2}',puzzle_id) or puzzle['href']!=f'/{puzzle_id}/':
        raise SystemExit(f'Invalid puzzle ID/path: {puzzle_id}')
    if not (root/'dist'/puzzle_id/'index.html').is_file():
        raise SystemExit(f'Missing built puzzle: {puzzle_id}')
    if not puzzle.get('summary','').strip():
        raise SystemExit(f'Missing summary: {puzzle_id}')
    values.append('('+','.join(literal(puzzle[key]) for key in ['season','id','title','summary','type'])+",'test',NULL)")
if values:
    query('INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at) VALUES '+','.join(values)+' ON CONFLICT(season_id,puzzle_id) DO NOTHING;')
print('New puzzle pages registered as test; existing metadata preserved')
