#!/usr/bin/env python3
"""
Extract moments from YouTube VTT transcripts with TIME-BASED CHUNKING
Preserves timestamp alignment for video synchronization
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
PREFIX_TRANSCRIPTS = 'youtube/transcripts/'
PREFIX_MOMENTS = 'moment-extraction/'

def parse_timestamp(timestamp_str):
    """Convert VTT timestamp to seconds"""
    # Format: HH:MM:SS.mmm or MM:SS.mmm
    parts = timestamp_str.strip().split(':')
    
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours = 0
        minutes, seconds = parts
    else:
        return 0.0
    
    return float(hours) * 3600 + float(minutes) * 60 + float(seconds)

def parse_vtt_with_timestamps(vtt_content):
    """Parse VTT and return list of (start_time, end_time, text) tuples"""
    captions = []
    lines = vtt_content.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for timestamp lines
        if '-->' in line:
            timestamp_parts = line.split('-->') 
            start_time = parse_timestamp(timestamp_parts[0])
            end_time_raw = timestamp_parts[1].strip().split()[0]  # Remove alignment info
            end_time = parse_timestamp(end_time_raw)
            
            # Next lines are the caption text
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip() and '-->' not in lines[i]:
                text_lines.append(lines[i].strip())
                i += 1
            
            text = ' '.join(text_lines)
            if text:
                captions.append((start_time, end_time, text))
        
        i += 1
    
    return captions

def chunk_by_time_ranges(captions, chunk_duration_seconds=600):
    """
    Chunk captions into time-based segments (default 10 minutes)
    Returns list of (chunk_text, metadata) tuples
    """
    if not captions:
        return []
    
    max_time = captions[-1][1]  # End time of last caption
    chunks = []
    
    current_start = 0
    while current_start < max_time:
        current_end = current_start + chunk_duration_seconds
        
        # Get all captions in this time range
        chunk_captions = [(s, e, t) for s, e, t in captions if s >= current_start and s < current_end]
        
        if chunk_captions:
            chunk_text = ' '.join([text for _, _, text in chunk_captions])
            metadata = {
                'type': 'time_range',
                'start_time': current_start,
                'end_time': min(current_end, max_time),
                'caption_count': len(chunk_captions)
            }
            chunks.append((chunk_text, metadata))
        
        current_start = current_end
    
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

            # Add chunk metadata (time range) to each moment
            for moment in moments:
                moment['chunk_metadata'] = chunk_metadata
                moment['approximate_video_time_start'] = chunk_metadata.get('start_time')
                moment['approximate_video_time_end'] = chunk_metadata.get('end_time')

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
    """Extract moments using time-based VTT chunking"""
    vtt_path = f'/tmp/{date}.vtt'

    # Download VTT from R2
    try:
        s3.download_file(BUCKET, f'{PREFIX_TRANSCRIPTS}{date}.vtt', vtt_path)
    except Exception as e:
        print(f"  ❌ Failed to download VTT: {e}", file=sys.stderr)
        return False

    # Parse VTT with timestamps
    try:
        with open(vtt_path, 'r') as f:
            vtt_content = f.read()

        captions = parse_vtt_with_timestamps(vtt_content)
        print(f"  📋 Parsed {len(captions)} captions", file=sys.stderr)

        # Chunk by 10-minute time ranges
        chunks = chunk_by_time_ranges(captions, chunk_duration_seconds=600)
        print(f"  📦 Created {len(chunks)} time-based chunks", file=sys.stderr)

    except Exception as e:
        print(f"  ❌ Failed to parse VTT: {e}", file=sys.stderr)
        return False

    # Extract moments from each chunk
    all_moments = []

    for i, (chunk_text, metadata) in enumerate(chunks, 1):
        start_min = int(metadata['start_time'] // 60)
        end_min = int(metadata['end_time'] // 60)
        print(f"  🔄 Chunk {i}/{len(chunks)}: {start_min}-{end_min} min ({len(chunk_text):,} chars)...", file=sys.stderr)

        moments = extract_moments_from_chunk(chunk_text, date, metadata)
        all_moments.extend(moments)

        # Rate limiting between chunks
        if i < len(chunks):
            import time
            time.sleep(120)  # 120 seconds between API calls (respecting 500 RPM limit)

    print(f"  ✅ Extracted {len(all_moments)} moments from {len(chunks)} chunks", file=sys.stderr)

    # Prepare output
    output = {
        'date': date,
        'model': 'gpt-5-mini',
        'extracted_at': datetime.utcnow().isoformat() + 'Z',
        'format': 'youtube_vtt',
        'chunks_processed': len(chunks),
        'moments': all_moments
    }

    # Upload to R2
    try:
        s3.put_object(
            Bucket=BUCKET,
            Key=f'{PREFIX_MOMENTS}youtube-{date}.json',
            Body=json.dumps(output),
            ContentType='application/json'
        )
        print(f"  ✅ Uploaded to R2", file=sys.stderr)
    except Exception as e:
        print(f"  ❌ Failed to upload: {e}", file=sys.stderr)
        return False

    # Cleanup
    if os.path.exists(vtt_path):
        os.remove(vtt_path)

    return True

def list_youtube_transcripts():
    """List all YouTube transcripts in R2"""
    print("📋 Listing YouTube transcripts from R2...", file=sys.stderr)

    transcripts = []
    continuation_token = None

    while True:
        list_kwargs = {
            'Bucket': BUCKET,
            'Prefix': PREFIX_TRANSCRIPTS,
            'MaxKeys': 1000
        }

        if continuation_token:
            list_kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**list_kwargs)

        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                if key.endswith('.vtt'):
                    date = key.replace(PREFIX_TRANSCRIPTS, '').replace('.vtt', '')
                    if date and date.count('-') == 2:
                        transcripts.append(date)

        if response.get('IsTruncated'):
            continuation_token = response.get('NextContinuationToken')
        else:
            break

    # Sort in reverse chronological order (newest first)
    transcripts.sort(reverse=True)

    print(f"✅ Found {len(transcripts)} YouTube transcripts", file=sys.stderr)
    return transcripts

def check_already_processed(date):
    """Check if moment extraction already exists for this date"""
    try:
        s3.head_object(Bucket=BUCKET, Key=f'{PREFIX_MOMENTS}youtube-{date}.json')
        return True
    except:
        return False

def main():
    print("=== YOUTUBE MOMENT EXTRACTION (TIME-BASED CHUNKING) ===", file=sys.stderr)
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print("", file=sys.stderr)

    transcripts = list_youtube_transcripts()

    total = len(transcripts)
    processed = 0
    skipped = 0

    for i, date in enumerate(transcripts, 1):
        # Check if already processed
        if check_already_processed(date):
            print(f"[{i}/{total}] SKIP - {date} (already processed)", file=sys.stderr)
            skipped += 1
            continue

        print(f"[{i}/{total}] {datetime.now().strftime('%H:%M:%S')} - Processing {date}...", file=sys.stderr)

        if extract_moments_chunked(date):
            processed += 1

    print("", file=sys.stderr)
    print("=== YOUTUBE EXTRACTION COMPLETE ===", file=sys.stderr)
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
