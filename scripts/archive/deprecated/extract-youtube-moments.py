#!/usr/bin/env python3
"""
Extract moments from YouTube transcripts using GPT-5-mini
Loads credentials from .dev.vars, uses boto3 for R2
"""

import boto3
import json
import sys
import os
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

    # Extract required credentials
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

# Set environment variable for subprocess
os.environ['OPENAI_API_KEY'] = OPENAI_API_KEY

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

def extract_moments(date):
    """Extract moments for a specific date using direct OpenAI API call"""
    vtt_path = f'/tmp/{date}.vtt'

    # Download VTT from R2
    try:
        s3.download_file(BUCKET, f'{PREFIX_TRANSCRIPTS}{date}.vtt', vtt_path)
    except Exception as e:
        print(f"  ❌ Failed to download VTT: {e}", file=sys.stderr)
        return False

    # Read VTT and extract text
    try:
        with open(vtt_path, 'r') as f:
            vtt_content = f.read()

        # Simple VTT parsing - extract just the text lines
        lines = []
        for line in vtt_content.split('\n'):
            line = line.strip()
            # Skip WEBVTT header, timestamps, and empty lines
            if line and not line.startswith('WEBVTT') and '-->' not in line and not line.isdigit():
                lines.append(line)

        transcript_text = '\n'.join(lines)[:200000]  # Limit to 200K chars

    except Exception as e:
        print(f"  ❌ Failed to read VTT: {e}", file=sys.stderr)
        return False

    # Prepare OpenAI request with timestamps
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
""" + transcript_text

    # Call OpenAI API
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

        if response.status_code != 200:
            print(f"  ❌ OpenAI API error: {response.status_code} {response.text[:200]}", file=sys.stderr)
            return False

        result = response.json()
        moments = json.loads(result['choices'][0]['message']['content'])

    except Exception as e:
        print(f"  ❌ API call failed: {e}", file=sys.stderr)
        return False

    # Prepare output
    output = {
        'date': date,
        'model': 'gpt-5-mini',
        'extracted_at': datetime.utcnow().isoformat() + 'Z',
        'moments': moments.get('moments', [])
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

def main():
    print("=== YOUTUBE MOMENT EXTRACTION (WITH TIMESTAMPS) ===", file=sys.stderr)
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

        if extract_moments(date):
            processed += 1

        # Rate limiting delay (gpt-5-mini: 3 RPM limit)
        import time
        time.sleep(25)  # 25 seconds = 2.4 RPM (under 3 RPM limit)

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
        sys.exit(1)
