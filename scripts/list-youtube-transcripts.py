#!/usr/bin/env python3
"""
List all YouTube transcripts in R2 with pagination support
Uses boto3 for S3-compatible R2 access
"""

import boto3
import json
import sys
import os
from datetime import datetime
from pathlib import Path

def load_credentials():
    """Load R2 credentials from .dev.vars file"""
    # Look for .dev.vars in project root
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
    required = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    missing = [k for k in required if k not in credentials]

    if missing:
        print(f"Error: Missing credentials in .dev.vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return (
        credentials['CLOUDFLARE_ACCOUNT_ID'],
        credentials['R2_ACCESS_KEY_ID'],
        credentials['R2_SECRET_ACCESS_KEY']
    )

# Load R2 credentials from .dev.vars
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY = load_credentials()

# Initialize R2 client
s3 = boto3.client(
    's3',
    endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'  # R2 uses 'auto' region
)

BUCKET = 'capless-preview'
PREFIX = 'youtube/transcripts/'

def list_all_transcripts():
    """List all YouTube transcripts in R2 with pagination"""
    print(f"📋 Listing YouTube transcripts from R2...", file=sys.stderr)

    transcripts = []
    continuation_token = None
    page = 1

    while True:
        # List objects with pagination
        list_kwargs = {
            'Bucket': BUCKET,
            'Prefix': PREFIX,
            'MaxKeys': 1000  # R2 supports up to 1000 per request
        }

        if continuation_token:
            list_kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**list_kwargs)

        # Extract dates from keys
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                # Extract date from youtube/transcripts/YYYY-MM-DD.vtt
                if key.endswith('.vtt'):
                    date = key.replace(PREFIX, '').replace('.vtt', '')
                    if date and date.count('-') == 2:  # Validate date format
                        transcripts.append(date)

        print(f"  Page {page}: Found {len(transcripts)} transcripts...", file=sys.stderr)

        # Check if there are more pages
        if response.get('IsTruncated'):
            continuation_token = response.get('NextContinuationToken')
            page += 1
        else:
            break

    # Sort in reverse chronological order (newest first)
    transcripts.sort(reverse=True)

    print(f"✅ Found {len(transcripts)} YouTube transcripts", file=sys.stderr)
    print(f"   Range: {transcripts[0]} → {transcripts[-1]}", file=sys.stderr)

    return transcripts

if __name__ == '__main__':
    try:
        transcripts = list_all_transcripts()

        # Output as JSON to stdout (so it can be consumed by other scripts)
        print(json.dumps(transcripts, indent=2))

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
