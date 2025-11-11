#!/usr/bin/env python3
"""
Extract moments from Hansard transcripts (no timestamps) using GPT-5-mini
Loads credentials from .dev.vars, uses boto3 for R2, direct OpenAI API
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

# Initialize R2 client
s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

BUCKET = 'capless-preview'
PREFIX_HANSARD = 'hansard/cleaned/'  # JSON files, not TXT
PREFIX_MOMENTS = 'moment-extraction/'

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
                    # Extract date from hansard/cleaned/DD-MM-YYYY.json
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

def extract_moments_direct(date):
    """Extract moments using direct OpenAI API call (no timestamps)"""
    # Download transcript from R2
    transcript_path = f'/tmp/{date}.json'

    try:
        s3.download_file(BUCKET, f'{PREFIX_HANSARD}{date}.json', transcript_path)
    except Exception as e:
        print(f"  ❌ Failed to download transcript: {e}", file=sys.stderr)
        return False

    # Read JSON and extract text
    try:
        with open(transcript_path, 'r') as f:
            data = json.load(f)

        # Extract text content from JSON (adjust key based on actual structure)
        # Assuming the JSON has a 'content' or 'text' field
        if 'content' in data:
            transcript_text = data['content'][:200000]
        elif 'text' in data:
            transcript_text = data['text'][:200000]
        else:
            # Fallback: convert entire JSON to string
            transcript_text = json.dumps(data)[:200000]

    except Exception as e:
        print(f"  ❌ Failed to parse JSON: {e}", file=sys.stderr)
        return False

    # Prepare OpenAI request
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

def main():
    print("=== HANSARD MOMENT EXTRACTION (NO TIMESTAMPS) ===", file=sys.stderr)
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print("", file=sys.stderr)

    dates = list_hansard_transcripts()

    total = len(dates)
    processed = 0
    skipped = 0

    for i, date in enumerate(dates, 1):
        # Check if already processed
        if check_already_processed(date):
            # Only print progress every 100 items for skipped
            if i % 100 == 0:
                print(f"[{i}/{total}] Progress: {processed} processed, {skipped} skipped", file=sys.stderr)
            skipped += 1
            continue

        print(f"[{i}/{total}] {datetime.now().strftime('%H:%M:%S')} - Processing {date}...", file=sys.stderr)

        if extract_moments_direct(date):
            processed += 1

        # Rate limiting delay (gpt-5-mini: 3 RPM limit)
        import time
        time.sleep(25)  # 25 seconds = 2.4 RPM (under 3 RPM limit)

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
        sys.exit(1)
