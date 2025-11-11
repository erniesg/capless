#!/usr/bin/env python3
"""
Extract moments from MOST RECENT 100 Hansard transcripts only.
Uses shared library for consistency and reduced duplication.

UPGRADED VERSION:
- Rich metadata tracking (chunk_id, section_titles, section_types)
- Proper rate limiting (2s instead of 120s)
- Uses shared extraction_common library
- Consistent with YouTube v2 pipeline
"""

import boto3
import json
import sys
import os
import time
from pathlib import Path
from datetime import datetime

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent))

from lib.extraction_common import (
    load_credentials,
    extract_moments_with_retry
)
from lib.chunking import chunk_by_sections

# Load credentials
creds = load_credentials()
R2_ACCOUNT_ID = creds['CLOUDFLARE_ACCOUNT_ID']
R2_ACCESS_KEY_ID = creds['R2_ACCESS_KEY_ID']
R2_SECRET_ACCESS_KEY = creds['R2_SECRET_ACCESS_KEY']
OPENAI_API_KEY = creds['OPENAI_API_KEY']

# Initialize R2 client
s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

BUCKET = 'capless-preview'
PREFIX_HANSARD = 'hansard/cleaned/'
PREFIX_MOMENTS = 'moment-extraction/'


def list_recent_hansard_files(limit=100):
    """List most recent Hansard files"""
    files = []

    continuation_token = None
    while True:
        kwargs = {'Bucket': BUCKET, 'Prefix': PREFIX_HANSARD, 'MaxKeys': 1000}
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**kwargs)

        if 'Contents' in response:
            for obj in response['Contents']:
                if obj['Key'].endswith('.json'):
                    files.append({
                        'key': obj['Key'],
                        'modified': obj['LastModified']
                    })

        if not response.get('IsTruncated'):
            break
        continuation_token = response.get('NextContinuationToken')

    # Sort by modified date (most recent first) and limit
    files.sort(key=lambda x: x['modified'], reverse=True)
    return files[:limit]


def fetch_hansard_from_r2(key):
    """Fetch Hansard from R2"""
    try:
        response = s3.get_object(Bucket=BUCKET, Key=key)
        content = response['Body'].read().decode('utf-8')
        return json.loads(content)
    except Exception as e:
        print(f"Error fetching {key}: {e}", file=sys.stderr)
        return None


def check_if_processed(date):
    """Check if moments already extracted for this date"""
    output_key = f'{PREFIX_MOMENTS}hansard-{date}.json'
    try:
        s3.head_object(Bucket=BUCKET, Key=output_key)
        return True
    except:
        return False


def upload_moments_to_r2(date, moments_data):
    """Upload extracted moments to R2"""
    output_key = f'{PREFIX_MOMENTS}hansard-{date}.json'

    try:
        s3.put_object(
            Bucket=BUCKET,
            Key=output_key,
            Body=json.dumps(moments_data, indent=2).encode('utf-8'),
            ContentType='application/json'
        )
        return True
    except Exception as e:
        print(f"Error uploading moments: {e}", file=sys.stderr)
        return False


def extract_moments_from_hansard(date, data):
    """Extract moments from Hansard data"""
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Processing Hansard: {date}", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)

    # Chunk by sections (respects Q&A boundaries)
    chunks = chunk_by_sections(data)

    if not chunks:
        print("❌ No chunks created", file=sys.stderr)
        return None

    print(f"📦 Created {len(chunks)} chunks (section-aware)\n", file=sys.stderr)

    # Print chunk summary
    for chunk_text, metadata in chunks:
        sections_str = ', '.join(map(str, metadata['sections']))
        titles_preview = metadata['section_titles'][0] if metadata.get('section_titles') else 'N/A'
        char_count = metadata.get('char_count', len(chunk_text))
        print(f"  • {metadata['chunk_id']}: sections {sections_str} | {titles_preview[:50]}... | {char_count:,} chars", file=sys.stderr)

    print("", file=sys.stderr)

    # Extract moments from each chunk
    all_moments = []

    for i, (chunk_text, metadata) in enumerate(chunks, 1):
        print(f"🔄 Processing chunk {i}/{len(chunks)} ({len(chunk_text):,} chars)...", file=sys.stderr)

        moments = extract_moments_with_retry(
            chunk_text=chunk_text,
            chunk_metadata=metadata,
            api_key=OPENAI_API_KEY,
            model='gpt-5-mini'
        )

        if moments:
            all_moments.extend(moments)
            print(f"  ✅ Extracted {len(moments)} moments", file=sys.stderr)
        else:
            print(f"  ⚠️  No moments extracted", file=sys.stderr)

        # Rate limiting: 2s between chunks (proper for 500 RPM limit)
        if i < len(chunks):
            print(f"  ⏳ Waiting 2s before next chunk...", file=sys.stderr)
            time.sleep(2)

        print("", file=sys.stderr)

    if not all_moments:
        print("❌ No moments extracted from any chunk", file=sys.stderr)
        return None

    # Prepare output with rich metadata
    output = {
        'date': date,
        'model': 'gpt-5-mini',
        'extracted_at': datetime.utcnow().isoformat() + 'Z',
        'format': 'NEW_STRUCTURED_FORMAT',
        'extraction_strategy': 'section_aware_chunked_v2',
        'chunks_processed': len(chunks),
        'chunks_metadata': [
            {
                'chunk_id': metadata['chunk_id'],
                'sections': metadata['sections'],
                'section_titles': metadata.get('section_titles', []),
                'section_types': metadata.get('section_types', []),
                'type': metadata['type'],
                'char_count': metadata.get('char_count', 0)
            }
            for _, metadata in chunks
        ],
        'moments': all_moments
    }

    print(f"✅ Extracted {len(all_moments)} total moments\n", file=sys.stderr)

    return output


def main():
    print("=" * 80, file=sys.stderr)
    print("HANSARD MOMENT EXTRACTION (RECENT 100 TRANSCRIPTS)", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    print("", file=sys.stderr)

    # List recent files
    print("📋 Fetching recent Hansard files...", file=sys.stderr)
    recent_files = list_recent_hansard_files(limit=100)
    print(f"Found {len(recent_files)} recent Hansard files\n", file=sys.stderr)

    processed_count = 0
    skipped_count = 0

    for file_info in recent_files:
        key = file_info['key']
        date = key.replace(PREFIX_HANSARD, '').replace('.json', '')

        # Skip if already processed
        if check_if_processed(date):
            print(f"⏭️  Skipping {date} (already processed)", file=sys.stderr)
            skipped_count += 1
            continue

        # Fetch Hansard data
        hansard_data = fetch_hansard_from_r2(key)

        if not hansard_data:
            print(f"❌ Failed to fetch {date}", file=sys.stderr)
            continue

        # Extract moments
        moments_data = extract_moments_from_hansard(date, hansard_data)

        if moments_data:
            # Upload to R2
            if upload_moments_to_r2(date, moments_data):
                print(f"✅ Uploaded moments for {date}", file=sys.stderr)
                processed_count += 1
            else:
                print(f"❌ Failed to upload moments for {date}", file=sys.stderr)
        else:
            print(f"⚠️  No moments extracted for {date}", file=sys.stderr)

        # Small delay between files
        time.sleep(1)

    print("\n" + "=" * 80, file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    print(f"Processed: {processed_count}", file=sys.stderr)
    print(f"Skipped (already done): {skipped_count}", file=sys.stderr)
    print(f"Total files checked: {len(recent_files)}", file=sys.stderr)
    print("=" * 80, file=sys.stderr)


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
