"""Compatibility entry point for the unified completion and daily RLS checks."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('verify-completion-policies.py')),run_name='__main__')
