"""Read-only administrator review of completion snapshots for the active season."""
import json,subprocess
from pathlib import Path
from database import query
rows=query("""
SELECT n.nickname,s.puzzle_id,s.state,s.state_version,s.submitted_at,d.givens
FROM public.completion_submissions s
JOIN public.semester_settings active ON active.id AND active.active_season=s.season_id
JOIN public.semester_nicknames n ON n.season_id=s.season_id AND n.user_id=s.user_id
LEFT JOIN public.daily_sudoku d ON s.puzzle_id='daily-sudoku:' || d.day::text
ORDER BY s.submitted_at DESC;
""")
subprocess.run(['node',str(Path(__file__).with_name('check-completion-states.mjs'))],input=json.dumps(rows),text=True,check=True)
print(f'Reviewed {len(rows)} submitted boards. Legacy records without snapshots remain unchanged.')
