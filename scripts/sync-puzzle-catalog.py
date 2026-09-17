"""Register published-list metadata for completion RPCs; never registers previews."""
import json
from pathlib import Path
from database import query
root=Path(__file__).resolve().parent.parent
puzzles=json.loads((root/'src/data/puzzles.json').read_text())
def literal(value): return "'"+value.replace("'","''")+"'"
values=','.join('('+','.join(literal(p[k]) for k in ['season','id','publishedAt'])+')' for p in puzzles if p.get('listed',True))
if values:
 query('INSERT INTO public.puzzle_catalog(season_id,puzzle_id,published_at) VALUES '+values+' ON CONFLICT(season_id,puzzle_id) DO UPDATE SET published_at=excluded.published_at;')
print('Puzzle catalog synchronized')
