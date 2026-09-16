#!/usr/bin/env python3
"""
Extract moments from Hansard transcripts with SECTION-BASED CHUNKING
Preserves natural boundaries to avoid splitting conversations
"""

import boto3
import json
import sys
import os
import re
import requests
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

    required = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'OPENAI_API_KEY']
    missing = [k for k in required if k not in credentials]

    if missing:
        print(f"Error: Missing credentials in .dev.vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return credentials

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

def strip_html(html_text):
    """Strip HTML tags from text"""
    clean = re.sub('<[^<]+?>', '', html_text)
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()

def chunk_by_sections(data):
    """
    Chunk recent structured transcripts by section boundaries
    Returns list of (chunk_text, metadata) tuples
    """
    sections = data.get('takesSectionVOList', [])

    if not sections:
        return []

    chunks = []
    current_chunk = []
    current_size = 0
    current_section_nums = []

    for i, section in enumerate(sections, 1):
        content_html = section.get('content', '')
        content_text = strip_html(content_html)
        section_size = len(content_text)

        title = section.get('title', 'N/A')
        section_type = section.get('sectionType', 'N/A')

        if section_size > 80000:
            # Large section - flush current chunk first
            if current_chunk:
                chunk_text = '\n\n'.join(current_chunk)
                chunks.append((chunk_text, {
                    'sections': current_section_nums,
                    'type': 'combined'
                }))
                current_chunk = []
                current_size = 0
                current_section_nums = []

            # Add large section as its own chunk (will need sub-chunking)
            chunks.append((content_text, {
                'sections': [i],
                'type': 'large',
                'title': title,
                'section_type': section_type
            }))

        elif current_size + section_size > 60000:
            # Current chunk would exceed limit - flush it
            if current_chunk:
                chunk_text = '\n\n'.join(current_chunk)
                chunks.append((chunk_text, {
                    'sections': current_section_nums,
                    'type': 'combined'
                }))

            # Start new chunk with this section
            current_chunk = [content_text]
            current_size = section_size
            current_section_nums = [i]

        else:
            # Add to current chunk
            current_chunk.append(content_text)
            current_size += section_size
            current_section_nums.append(i)

    # Flush remaining chunk
    if current_chunk:
        chunk_text = '\n\n'.join(current_chunk)
        chunks.append((chunk_text, {
            'sections': current_section_nums,
            'type': 'combined'
        }))

    return chunks

def chunk_old_format(full_text):
    """
    Chunk old format by paragraph boundaries (if needed)
    Most old transcripts fit in 80K so this is rarely used
    """
    if len(full_text) <= 80000:
        return [(full_text, {'type': 'complete'})]

    # Split by double newlines (paragraph boundaries)
    paragraphs = full_text.split('\n\n')

    chunks = []
    current_chunk = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para)

        if current_size + para_size > 60000:
            if current_chunk:
                chunks.append(('\n\n'.join(current_chunk), {'type': 'partial'}))
            current_chunk = [para]
            current_size = para_size
        else:
            current_chunk.append(para)
            current_size += para_size

    if current_chunk:
        chunks.append(('\n\n'.join(current_chunk), {'type': 'partial'}))

    return chunks

def extract_moments_from_chunk(chunk_text, date, chunk_metadata, max_retries=3):
    """Extract moments from a single chunk with exponential backoff for rate limiting"""
    import time
    import random

    prompt = """You are a TikTok content curator. Extract 5-10 viral moments from this parliament session.

Categories: Reality Check, Mic Drop Mondays, Comedy Gold, Drama Alert, Wholesome Wednesdays, Spicy Takes, 30-Second Parliament, Big Brain Moments, Face Palm Friday, Underdog Wins, Plot Twist

Return JSON with:
{
  "moments": [
    {
      "category": "Category name",
      "title": "Catchy 5-10 word headline",
      "quote": "Verbatim quote from transcript",
      "context": "Why this matters (2-3 sentences)",
      "why_viral": "Why this will go viral",
      "viral_score": 7-10,
      "estimated_duration": 15-90,
      "speaker": "Name if available"
    }
  ]
}

Transcript:
""" + chunk_text

    for attempt in range(max_retries):
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {OPENAI_API_KEY}'
                },
                json={
                    'model': 'gpt-5-mini',
                    'messages': [
                        {'role': 'system', 'content': 'You are an expert TikTok content curator for Singaporean political content. Return only valid JSON, no markdown.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'response_format': {'type': 'json_object'}
                },
                timeout=120
            )

            # Handle rate limiting with exponential backoff
            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)  # 2s, 4s, 8s + jitter
                    print(f"  ⏳ Rate limited. Retry {attempt+1}/{max_retries} in {wait_time:.1f}s...", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"  ❌ Rate limit exceeded after {max_retries} retries", file=sys.stderr)
                    return []

            if response.status_code != 200:
                print(f"  ❌ OpenAI API error: {response.status_code} {response.text[:200]}", file=sys.stderr)
                return []

            result = response.json()
            moments_data = json.loads(result['choices'][0]['message']['content'])
            moments = moments_data.get('moments', [])

            # Add chunk metadata to each moment
            for moment in moments:
                moment['chunk_metadata'] = chunk_metadata

            return moments

        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                print(f"  ⏳ Error: {e}. Retry {attempt+1}/{max_retries} in {wait_time:.1f}s...", file=sys.stderr)
                time.sleep(wait_time)
            else:
                print(f"  ❌ Final attempt failed: {e}", file=sys.stderr)
                return []

    return []

def extract_moments_chunked(date):
    """Extract moments using section-based chunking"""
    transcript_path = f'/tmp/{date}.json'

    # Download transcript from R2
    try:
        s3.download_file(BUCKET, f'{PREFIX_HANSARD}{date}.json', transcript_path)
    except Exception as e:
        print(f"  ❌ Failed to download transcript: {e}", file=sys.stderr)
        return False

    # Read and parse JSON
    try:
        with open(transcript_path, 'r') as f:
            data = json.load(f)

        # Detect format and chunk appropriately
        format_type = data.get('format', 'unknown')

        if format_type == 'NEW_STRUCTURED_FORMAT':
            print(f"  📋 Recent format with sections", file=sys.stderr)
            chunks = chunk_by_sections(data)
        elif format_type == 'OLD_HTML_FORMAT':
            print(f"  📋 Old format", file=sys.stderr)
            full_text = data.get('cleanedContent', {}).get('fullText', '')
            chunks = chunk_old_format(full_text)
        else:
            # Fallback
            print(f"  ⚠️  Unknown format: {format_type}", file=sys.stderr)
            return False

        print(f"  📦 Created {len(chunks)} chunks", file=sys.stderr)

    except Exception as e:
        print(f"  ❌ Failed to parse JSON: {e}", file=sys.stderr)
        return False

    # Extract moments from each chunk
    all_moments = []

    for i, (chunk_text, metadata) in enumerate(chunks, 1):
        print(f"  🔄 Processing chunk {i}/{len(chunks)} ({len(chunk_text):,} chars)...", file=sys.stderr)

        moments = extract_moments_from_chunk(chunk_text, date, metadata)
        all_moments.extend(moments)

        # Rate limiting between chunks
        if i < len(chunks):
            import time
            time.sleep(60)  # 60 seconds between API calls

    print(f"  ✅ Extracted {len(all_moments)} moments from {len(chunks)} chunks", file=sys.stderr)

    # Prepare output
    output = {
        'date': date,
        'model': 'gpt-5-mini',
        'extracted_at': datetime.utcnow().isoformat() + 'Z',
        'format': data.get('format', 'unknown'),
        'chunks_processed': len(chunks),
        'moments': all_moments
    }

    # Upload to R2
    try:
        s3.put_object(
            Bucket=BUCKET,
            Key=f'{PREFIX_MOMENTS}hansard-{date}.json',
            Body=json.dumps(output),
            ContentType='application/json'
        )
        print(f"  ✅ Uploaded to R2", file=sys.stderr)
    except Exception as e:
        print(f"  ❌ Failed to upload: {e}", file=sys.stderr)
        return False

    # Cleanup
    if os.path.exists(transcript_path):
        os.remove(transcript_path)

    return True

def list_hansard_transcripts():
    """List all Hansard transcripts in R2"""
    print("📋 Listing Hansard transcripts from R2...", file=sys.stderr)

    dates = []
    continuation_token = None

    while True:
        list_kwargs = {
            'Bucket': BUCKET,
            'Prefix': PREFIX_HANSARD,
            'MaxKeys': 1000
        }

        if continuation_token:
            list_kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**list_kwargs)

        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                if key.endswith('.json'):
                    date = key.replace(PREFIX_HANSARD, '').replace('.json', '')
                    if date and date.count('-') == 2:
                        dates.append(date)

        if response.get('IsTruncated'):
            continuation_token = response.get('NextContinuationToken')
        else:
            break

    # Sort in reverse chronological order (newest first)
    dates.sort(reverse=True)

    print(f"✅ Found {len(dates)} Hansard transcripts", file=sys.stderr)
    return dates

def check_already_processed(date):
    """Check if moment extraction already exists for this date"""
    try:
        s3.head_object(Bucket=BUCKET, Key=f'{PREFIX_MOMENTS}hansard-{date}.json')
        return True
    except:
        return False

def main():
    print("=== HANSARD MOMENT EXTRACTION (SECTION-BASED CHUNKING) ===", file=sys.stderr)
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print("", file=sys.stderr)

    dates = list_hansard_transcripts()

    total = len(dates)
    processed = 0
    skipped = 0

    for i, date in enumerate(dates, 1):
        # Check if already processed
        if check_already_processed(date):
            if i % 100 == 0:
                print(f"[{i}/{total}] Progress: {processed} processed, {skipped} skipped", file=sys.stderr)
            skipped += 1
            continue

        print(f"[{i}/{total}] {datetime.now().strftime('%H:%M:%S')} - Processing {date}...", file=sys.stderr)

        if extract_moments_chunked(date):
            processed += 1

    print("", file=sys.stderr)
    print("=== HANSARD EXTRACTION COMPLETE ===", file=sys.stderr)
    print(f"Total: {total} | Processed: {processed} | Skipped: {skipped}", file=sys.stderr)
    print(f"End: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)

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
