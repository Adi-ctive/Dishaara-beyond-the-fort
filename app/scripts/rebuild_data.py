"""Rebuilds the city data files in order. Run after any change to the research ledger or the scripts.
  python scripts/rebuild_data.py
1. build_extras.py      places beyond the heritage list (replaces its own places)
2. apply_research.py    the web research ledger, then FAQs from the facts (build_faqs.py)
3. build_directory.py   helplines, hospitals, police, transport, hotels
4. build_media.py       Commons photos and official links
Then bump nothing by hand: apply_research sets city.dataVersion, so the next deploy re-imports into Atlas.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
for s in ("build_extras.py", "apply_research.py", "build_directory.py", "build_media.py"):
    print(f"== {s}", flush=True)
    r = subprocess.run([sys.executable, str(HERE / s)], capture_output=True, text=True, encoding="utf-8")
    print("\n".join(r.stdout.strip().splitlines()[-3:]))
    if r.returncode:
        print(r.stderr)
        sys.exit(r.returncode)
