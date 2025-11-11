#!/usr/bin/env python3
"""
Common functions for moment extraction from YouTube and Hansard transcripts.
Reduces code duplication across extraction scripts.
"""

import sys
import json
import time
import random
import requests
import boto3
from pathlib import Path
from datetime import datetime


def load_credentials():
    """Load credentials from .dev.vars file"""
    project_root = Path(__file__).parent.parent.parent
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

    required = ['OPENAI_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    missing = [k for k in required if k not in credentials]

    if missing:
        print(f"Error: Missing credentials in .dev.vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return credentials


def strip_html(html_text):
    """Strip HTML tags from text"""
    import re
    clean = re.sub('<[^<]+?>', '', html_text)
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()


def fetch_from_r2(bucket, key, credentials):
    """Fetch object from Cloudflare R2"""
    try:
        s3 = boto3.client(
            's3',
            endpoint_url=f'https://{credentials["CLOUDFLARE_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
            aws_access_key_id=credentials['R2_ACCESS_KEY_ID'],
            aws_secret_access_key=credentials['R2_SECRET_ACCESS_KEY'],
            region_name='auto'
        )

        response = s3.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read()

        # Try to decode as JSON
        if key.endswith('.json'):
            return json.loads(content.decode('utf-8'))
        elif key.endswith('.vtt'):
            return content.decode('utf-8')
        else:
            return content.decode('utf-8')

    except Exception as e:
        print(f"Error fetching from R2: {e}", file=sys.stderr)
        return None


def upload_to_r2(bucket, key, content, credentials, content_type='application/json'):
    """Upload object to Cloudflare R2"""
    try:
        s3 = boto3.client(
            's3',
            endpoint_url=f'https://{credentials["CLOUDFLARE_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
            aws_access_key_id=credentials['R2_ACCESS_KEY_ID'],
            aws_secret_access_key=credentials['R2_SECRET_ACCESS_KEY'],
            region_name='auto'
        )

        # Convert to bytes if needed
        if isinstance(content, (dict, list)):
            content = json.dumps(content, indent=2).encode('utf-8')
        elif isinstance(content, str):
            content = content.encode('utf-8')

        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=content,
            ContentType=content_type
        )

        return True

    except Exception as e:
        print(f"Error uploading to R2: {e}", file=sys.stderr)
        return False


def extract_moments_with_retry(chunk_text, chunk_metadata, api_key, model='gpt-5-mini', max_retries=3):
    """
    Extract viral moments from transcript chunk with retry logic.

    Args:
        chunk_text: Transcript text to analyze
        chunk_metadata: Metadata about the chunk (chunk_id, sections, etc.)
        api_key: OpenAI API key
        model: Model to use (default: gpt-5-mini)
        max_retries: Maximum retry attempts

    Returns:
        List of extracted moments with metadata
    """

    prompt = f"""You are extracting VIRAL moments from a parliamentary session transcript.

Be SELECTIVE. Only extract moments that are TRULY viral-worthy:
- Score 8+ material: Shocking, hilarious, or deeply problematic
- Score 7-8 material: Strong shareable content
- Skip anything below 7

Extract 5-10 moments maximum. Focus on:

PROBLEMATIC moments:
- Bureaucratic doublespeak or dense jargon
- Contradictions or illogical reasoning
- Defensive or evasive responses
- Out-of-touch statements
- Controversial statistics or comparisons

WHOLESOME/POSITIVE moments:
- Compassionate responses showing empathy
- Bold policy commitments
- Pragmatic solutions
- Inspiring statements

Return ONLY a JSON object with this structure:
{{
  "moments": [
    {{
      "quote": "Exact verbatim quote from transcript (15-40 words optimal)",
      "speaker": "Speaker name if identifiable",
      "why_viral": "Why this will go viral (1-2 sentences)",
      "viral_score": 7.0-10.0,
      "category": "Reality Check/Drama Alert/Wholesome/etc",
      "title": "Catchy 5-10 word headline"
    }}
  ]
}}

Transcript:
{chunk_text}"""

    for attempt in range(max_retries):
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                },
                json={
                    'model': model,
                    'messages': [
                        {'role': 'system', 'content': 'You are an expert content curator for viral political moments. Return only valid JSON, no markdown.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'response_format': {'type': 'json_object'}
                },
                timeout=120
            )

            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)
                    print(f"⏳ Rate limited. Retry in {wait_time:.1f}s...", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"❌ Rate limit exceeded", file=sys.stderr)
                    return None

            if response.status_code != 200:
                print(f"❌ OpenAI API error: {response.status_code} {response.text[:200]}", file=sys.stderr)
                return None

            result = response.json()
            moments_data = json.loads(result['choices'][0]['message']['content'])
            moments = moments_data.get('moments', [])

            # Add chunk metadata to each moment
            for moment in moments:
                moment['source_chunk_id'] = chunk_metadata.get('chunk_id', 'unknown')
                moment['source_sections'] = chunk_metadata.get('sections', [])
                moment['source_section_titles'] = chunk_metadata.get('section_titles', [])
                moment['chunk_metadata'] = chunk_metadata

            return moments

        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                print(f"⏳ Error: {e}. Retry in {wait_time:.1f}s...", file=sys.stderr)
                time.sleep(wait_time)
            else:
                print(f"❌ Final attempt failed: {e}", file=sys.stderr)
                return None

    return None
