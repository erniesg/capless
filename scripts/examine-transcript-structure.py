#!/usr/bin/env python3
"""
Examine transcript structure from different years to understand:
1. JSON structure (fields, format)
2. Section boundaries and organization
3. Cleaned vs raw differences
4. How to properly chunk without splitting conversations
"""

import boto3
import json
import sys
from pathlib import Path
from datetime import datetime

def load_credentials():
    """Load credentials from .dev.vars file"""
    project_root = Path(__file__).parent.parent
    dev_vars_path = project_root / '.dev.vars'

    if not dev_vars_path.exists():
        print(f"Error: .dev.vars file not found at {dev_vars_path}", file=sys.stderr)
        sys.exit(1)

    credentials = {}
    with open(dev_vars_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                credentials[key.strip()] = value.strip()

    required = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    missing = [k for k in required if k not in credentials]

    if missing:
        print(f"Error: Missing credentials: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return credentials

# Load credentials
creds = load_credentials()
R2_ACCOUNT_ID = creds['CLOUDFLARE_ACCOUNT_ID']
R2_ACCESS_KEY_ID = creds['R2_ACCESS_KEY_ID']
R2_SECRET_ACCESS_KEY = creds['R2_SECRET_ACCESS_KEY']

# Initialize R2 client
s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

BUCKET = 'capless-preview'

def list_sample_files(prefix, limit=50):
    """List sample files from a prefix"""
    print(f"\n📋 Listing sample files from {prefix}...")

    try:
        response = s3.list_objects_v2(
            Bucket=BUCKET,
            Prefix=prefix,
            MaxKeys=limit
        )

        if 'Contents' not in response:
            print(f"  ❌ No files found")
            return []

        files = [obj['Key'] for obj in response['Contents']]
        print(f"  ✅ Found {len(files)} files (showing first {limit})")

        # Show first few files
        for f in files[:10]:
            print(f"     - {f}")

        if len(files) > 10:
            print(f"     ... and {len(files) - 10} more")

        return files

    except Exception as e:
        print(f"  ❌ Error: {e}")
        return []

def analyze_json_structure(key, label):
    """Download and analyze JSON structure"""
    print(f"\n🔍 Analyzing: {label}")
    print(f"   Key: {key}")

    local_path = f'/tmp/examine_{label.replace(" ", "_")}.json'

    try:
        # Download
        s3.download_file(BUCKET, key, local_path)

        # Read and analyze
        with open(local_path, 'r') as f:
            data = json.load(f)

        # Show structure
        print(f"\n   📊 JSON Structure:")
        print(f"   Type: {type(data)}")

        if isinstance(data, dict):
            print(f"   Top-level keys: {list(data.keys())}")

            # Examine each key
            for k, v in data.items():
                print(f"\n   Key: '{k}'")
                print(f"     Type: {type(v)}")

                if isinstance(v, str):
                    print(f"     Length: {len(v)} characters")
                    print(f"     Preview (first 500 chars):")
                    print(f"     {v[:500]}")
                    if len(v) > 500:
                        print(f"     ... ({len(v) - 500} more characters)")

                    # Check for section markers
                    if '\n\n' in v:
                        sections = v.split('\n\n')
                        print(f"     Contains {len(sections)} double-newline sections")

                    if '---' in v:
                        print(f"     Contains '---' section markers")

                    # Check for speaker patterns
                    lines = v.split('\n')
                    speaker_lines = [l for l in lines[:50] if ':' in l and len(l.split(':')[0]) < 100]
                    if speaker_lines:
                        print(f"     Appears to have speaker format (name: text)")
                        print(f"     Sample speaker lines:")
                        for sl in speaker_lines[:3]:
                            print(f"       {sl[:100]}")

                elif isinstance(v, list):
                    print(f"     Length: {len(v)} items")
                    if len(v) > 0:
                        print(f"     First item type: {type(v[0])}")
                        if isinstance(v[0], dict):
                            print(f"     First item keys: {list(v[0].keys())}")
                        print(f"     First item preview: {str(v[0])[:200]}")

                elif isinstance(v, dict):
                    print(f"     Nested keys: {list(v.keys())}")

        elif isinstance(data, list):
            print(f"   Length: {len(data)} items")
            if len(data) > 0:
                print(f"   First item: {str(data[0])[:300]}")

        return data

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def analyze_vtt_structure(key, label):
    """Download and analyze VTT structure"""
    print(f"\n🔍 Analyzing: {label}")
    print(f"   Key: {key}")

    local_path = f'/tmp/examine_{label.replace(" ", "_")}.vtt'

    try:
        # Download
        s3.download_file(BUCKET, key, local_path)

        # Read and analyze
        with open(local_path, 'r') as f:
            content = f.read()

        print(f"\n   📊 VTT Structure:")
        print(f"   Total length: {len(content)} characters")

        # Parse VTT
        lines = content.split('\n')
        print(f"   Total lines: {len(lines)}")

        # Count timestamps
        timestamp_lines = [l for l in lines if '-->' in l]
        print(f"   Timestamp entries: {len(timestamp_lines)}")

        # Show sample
        print(f"\n   Sample (first 1000 chars):")
        print(f"   {content[:1000]}")

        return content

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def main():
    print("=== TRANSCRIPT STRUCTURE EXAMINATION ===")
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\n" + "="*60)

    # 1. List files from different locations
    print("\n### STEP 1: Listing files from R2 ###")

    cleaned_files = list_sample_files('hansard/cleaned/', limit=50)
    raw_files = list_sample_files('hansard/raw/', limit=50)
    youtube_files = list_sample_files('youtube/transcripts/', limit=30)

    # 2. Analyze cleaned Hansard from different years
    print("\n" + "="*60)
    print("\n### STEP 2: Analyzing CLEANED Hansard transcripts ###")

    # Recent (2024-2025)
    recent_cleaned = [f for f in cleaned_files if '2024' in f or '2025' in f]
    if recent_cleaned:
        analyze_json_structure(recent_cleaned[0], "Recent Cleaned (2024-2025)")

    # Old (1980s)
    old_cleaned = [f for f in cleaned_files if '198' in f]
    if old_cleaned:
        analyze_json_structure(old_cleaned[0], "Old Cleaned (1980s)")

    # Very old (1960s)
    very_old_cleaned = [f for f in cleaned_files if '196' in f]
    if very_old_cleaned:
        analyze_json_structure(very_old_cleaned[0], "Very Old Cleaned (1960s)")

    # 3. Check raw vs cleaned
    print("\n" + "="*60)
    print("\n### STEP 3: Comparing RAW vs CLEANED ###")

    # Find a date that exists in both
    cleaned_dates = set([f.split('/')[-1].replace('.json', '') for f in cleaned_files])
    raw_dates = set([f.split('/')[-1].replace('.txt', '') for f in raw_files])
    common_dates = cleaned_dates.intersection(raw_dates)

    if common_dates:
        sample_date = list(common_dates)[0]
        print(f"\nComparing date: {sample_date}")

        cleaned_key = f'hansard/cleaned/{sample_date}.json'
        raw_key = f'hansard/raw/{sample_date}.txt'

        print("\n--- CLEANED VERSION ---")
        cleaned_data = analyze_json_structure(cleaned_key, f"Cleaned {sample_date}")

        print("\n--- RAW VERSION ---")
        # Download raw
        local_raw = f'/tmp/examine_raw_{sample_date}.txt'
        try:
            s3.download_file(BUCKET, raw_key, local_raw)
            with open(local_raw, 'r') as f:
                raw_content = f.read()

            print(f"   Raw length: {len(raw_content)} characters")
            print(f"   Preview (first 1000 chars):")
            print(f"   {raw_content[:1000]}")

            if cleaned_data and isinstance(cleaned_data, dict) and 'content' in cleaned_data:
                cleaned_content = cleaned_data['content']
                print(f"\n   📊 Comparison:")
                print(f"   Raw length:     {len(raw_content):,} chars")
                print(f"   Cleaned length: {len(cleaned_content):,} chars")
                print(f"   Reduction:      {len(raw_content) - len(cleaned_content):,} chars ({100 * (len(raw_content) - len(cleaned_content)) / len(raw_content):.1f}%)")

        except Exception as e:
            print(f"   ❌ Error reading raw: {e}")
    else:
        print("\n⚠️  No common dates found between cleaned and raw")

    # 4. Analyze YouTube VTT
    print("\n" + "="*60)
    print("\n### STEP 4: Analyzing YouTube VTT transcripts ###")

    if youtube_files:
        analyze_vtt_structure(youtube_files[0], "YouTube Transcript")

    # 5. Summary and recommendations
    print("\n" + "="*60)
    print("\n### SUMMARY & RECOMMENDATIONS ###")
    print("""
Based on the analysis above:

1. STRUCTURE FINDINGS:
   - Check if cleaned Hansard has clear section boundaries
   - Check if there's a speaker/paragraph structure we can preserve
   - Compare token efficiency of cleaned vs raw

2. CHUNKING STRATEGY:
   - If sections exist: chunk at section boundaries
   - If speaker format: preserve complete speaker turns
   - Otherwise: use sentence boundaries with overlap

3. CLEANED vs RAW:
   - Use cleaned if it reduces redundant tokens significantly
   - Use raw if cleaned loses important context

4. YOUTUBE VTT:
   - Already has timestamps - can chunk by time ranges
   - Preserve caption timing for proper moment extraction
    """)

    print(f"\nEnd: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
