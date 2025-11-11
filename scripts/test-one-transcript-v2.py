#!/usr/bin/env python3
"""
Test v2 extraction on a single transcript
"""
import sys
from pathlib import Path

# Import from the main script
sys.path.insert(0, str(Path(__file__).parent))

# Import functions from v2 script
import importlib.util
spec = importlib.util.spec_from_file_location("v2", "scripts/extract-youtube-moments-v2.py")
v2_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2_module)

if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 test-one-transcript-v2.py <date>")
        print("Example: python3 test-one-transcript-v2.py 2024-08-06")
        sys.exit(1)

    date = sys.argv[1]
    print(f"Testing v2 extraction on: {date}")
    print("="*60)

    success = v2_module.extract_moments_v2(date)

    if success:
        print("\n✅ SUCCESS!")
        print(f"Check R2: moment-extraction/youtube-v2-{date}.json")
    else:
        print("\n❌ FAILED")
        sys.exit(1)
