#!/usr/bin/env python3
"""
Deep dive into transcript content to understand chunking strategy
"""

import boto3
import json
import sys
from pathlib import Path

def load_credentials():
    """Load credentials from .dev.vars"""
    project_root = Path(__file__).parent.parent
    dev_vars_path = project_root / '.dev.vars'

    credentials = {}
    with open(dev_vars_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                credentials[key.strip()] = value.strip()

    return credentials

creds = load_credentials()
s3 = boto3.client(
    's3',
    endpoint_url=f'https://{creds["CLOUDFLARE_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
    aws_access_key_id=creds['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=creds['R2_SECRET_ACCESS_KEY'],
    region_name='auto'
)

BUCKET = 'capless-preview'

def analyze_recent_structured(key):
    """Analyze recent structured format"""
    print(f"\n{'='*80}")
    print(f"ANALYZING RECENT STRUCTURED FORMAT: {key}")
    print(f"{'='*80}\n")

    local_path = '/tmp/recent_structured.json'
    s3.download_file(BUCKET, key, local_path)

    with open(local_path, 'r') as f:
        data = json.load(f)

    # Extract takesSectionVOList
    sections = data.get('takesSectionVOList', [])

    print(f"📊 STRUCTURE ANALYSIS:")
    print(f"  Total sections: {len(sections)}")
    print(f"\n🔍 SECTION BREAKDOWN:\n")

    for i, section in enumerate(sections, 1):
        content = section.get('content', '')
        # Strip HTML tags for character count
        import re
        text_only = re.sub('<[^<]+?>', '', content)

        print(f"  Section {i}:")
        print(f"    Title: {section.get('title', 'N/A')[:80]}")
        print(f"    Type: {section.get('sectionType', 'N/A')}")
        print(f"    Content (HTML): {len(content):,} chars")
        print(f"    Content (text): {len(text_only):,} chars")
        print(f"    Sample (first 200 chars):")
        print(f"      {text_only[:200].replace(chr(10), ' ')}")
        print()

    # Calculate total content
    total_html = sum(len(s.get('content', '')) for s in sections)
    total_text = 0
    for section in sections:
        content = section.get('content', '')
        import re
        text_only = re.sub('<[^<]+?>', '', content)
        total_text += len(text_only)

    print(f"\n📈 TOTALS:")
    print(f"  Total HTML content: {total_html:,} characters")
    print(f"  Total text content: {total_text:,} characters")
    print(f"  HTML overhead: {100 * (total_html - total_text) / total_html:.1f}%")

    # Check if we need chunking
    print(f"\n💡 CHUNKING ASSESSMENT:")
    if total_text < 200000:
        print(f"  ✅ NO CHUNKING NEEDED - fits in 200K limit")
    else:
        print(f"  ⚠️  CHUNKING REQUIRED - exceeds 200K by {total_text - 200000:,} chars")
        print(f"  ✅ Natural boundaries: {len(sections)} sections available")
        print(f"  💡 Strategy: Split by section boundaries, combine small adjacent sections")

def analyze_old_format(key):
    """Analyze old HTML format"""
    print(f"\n{'='*80}")
    print(f"ANALYZING OLD FORMAT: {key}")
    print(f"{'='*80}\n")

    local_path = '/tmp/old_format.json'
    s3.download_file(BUCKET, key, local_path)

    with open(local_path, 'r') as f:
        data = json.load(f)

    cleaned = data.get('cleanedContent', {})
    full_text = cleaned.get('fullText', '')
    columns = cleaned.get('columns', [])

    print(f"📊 STRUCTURE ANALYSIS:")
    print(f"  Full text length: {len(full_text):,} characters")
    print(f"  Number of columns: {len(columns)}")
    print(f"\n🔍 CONTENT SAMPLE (first 1000 chars):\n")
    print(f"{full_text[:1000]}\n")

    # Check for natural boundaries
    print(f"💡 BOUNDARY DETECTION:")
    double_newlines = full_text.count('\n\n')
    print(f"  Double newlines (\\n\\n): {double_newlines}")

    # Check for speaker patterns
    lines = full_text.split('\n')
    speaker_lines = [l for l in lines if ':' in l and len(l.split(':')[0]) < 100]
    print(f"  Lines with speaker pattern (Name:): {len(speaker_lines)} / {len(lines)}")

    # Sample speaker lines
    if speaker_lines:
        print(f"\n  Sample speaker lines:")
        for sl in speaker_lines[:5]:
            print(f"    {sl[:120]}")

    print(f"\n💡 CHUNKING ASSESSMENT:")
    if len(full_text) < 200000:
        print(f"  ✅ NO CHUNKING NEEDED - fits in 200K limit")
    else:
        print(f"  ⚠️  CHUNKING REQUIRED - exceeds 200K by {len(full_text) - 200000:,} chars")
        if double_newlines > 0:
            print(f"  ✅ Can use double-newline boundaries for chunking")
        if len(speaker_lines) > len(lines) / 2:
            print(f"  ✅ Can preserve speaker turns (avoid splitting mid-conversation)")

def main():
    print("=== DEEP CONTENT ANALYSIS FOR CHUNKING STRATEGY ===\n")

    # Analyze recent structured format
    analyze_recent_structured('hansard/cleaned/01-03-2024.json')

    # Analyze old format
    analyze_old_format('hansard/cleaned/01-03-1985.json')

    # Recommendations
    print(f"\n{'='*80}")
    print("FINAL RECOMMENDATIONS")
    print(f"{'='*80}\n")

    print("""
1. **RECENT TRANSCRIPTS (2024+)**:
   - Use NEW_STRUCTURED_FORMAT with section boundaries
   - Split by `takesSectionVOList` sections
   - Combine adjacent small sections if needed
   - Strip HTML tags to reduce token usage
   - NO truncation - use all sections

2. **OLD TRANSCRIPTS (pre-2024)**:
   - Use OLD_HTML_FORMAT with fullText
   - Check if double-newline boundaries exist
   - Preserve speaker turns (avoid splitting "Name: text")
   - If > 200K chars: chunk by paragraph boundaries
   - Maintain context overlap between chunks

3. **CLEANED vs RAW**:
   - ALWAYS use cleaned version
   - Cleaned removes redundant HTML overhead
   - Preserves all content structure

4. **YOUTUBE VTT**:
   - Already has natural timestamp boundaries
   - Can chunk by time ranges (e.g., 30-min chunks)
   - Preserve timestamp alignment for moment extraction
    """)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
