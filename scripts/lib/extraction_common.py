#!/usr/bin/env python3
"""
Common functions for moment extraction from YouTube and Hansard transcripts.
Reduces code duplication across extraction scripts.
"""

import sys
import json
import time
import random
import math
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


def generate_embeddings(texts, api_key, max_retries=3):
    """
    Generate embeddings using OpenAI text-embedding-3-small

    Args:
        texts: List of text strings to embed
        api_key: OpenAI API key
        max_retries: Maximum retry attempts

    Returns:
        List of embedding vectors or None on failure
    """
    for attempt in range(max_retries):
        try:
            response = requests.post(
                'https://api.openai.com/v1/embeddings',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                },
                json={
                    'model': 'text-embedding-3-small',
                    'input': texts
                },
                timeout=60
            )

            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)
                    print(f"  ⏳ Embedding rate limited. Retry {attempt+1}/{max_retries} in {wait_time:.1f}s...", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"  ❌ Embedding rate limit exceeded", file=sys.stderr)
                    return None

            if response.status_code != 200:
                print(f"  ❌ Embedding API error: {response.status_code}", file=sys.stderr)
                return None

            result = response.json()
            return [item['embedding'] for item in result['data']]

        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                print(f"  ⏳ Embedding error: {e}. Retry {attempt+1}/{max_retries} in {wait_time:.1f}s...", file=sys.stderr)
                time.sleep(wait_time)
            else:
                print(f"  ❌ Embedding failed: {e}", file=sys.stderr)
                return None

    return None


def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors"""
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot_product / (norm_a * norm_b) if (norm_a * norm_b) > 0 else 0


def semantic_deduplication(moments, api_key, threshold=0.85):
    """
    Remove semantically similar moments using embeddings

    Args:
        moments: List of moment dictionaries with 'quote' field
        api_key: OpenAI API key
        threshold: Similarity threshold for considering duplicates (default: 0.85)

    Returns:
        Tuple of (unique_moments, deduplication_decisions)
    """
    if not moments:
        return [], []

    print(f"  🧠 Generating embeddings for {len(moments)} moments...", file=sys.stderr)

    # Generate embeddings for all quotes
    quotes = [m['quote'] for m in moments]
    embeddings = generate_embeddings(quotes, api_key)

    if embeddings is None:
        print(f"  ⚠️ Embedding generation failed, skipping semantic deduplication", file=sys.stderr)
        return moments, []

    # Find duplicates using similarity matrix
    unique_moments = []
    removed_indices = set()
    dedup_decisions = []

    for i in range(len(moments)):
        if i in removed_indices:
            continue

        unique_moments.append(moments[i])

        # Find similar moments
        for j in range(i + 1, len(moments)):
            if j in removed_indices:
                continue

            similarity = cosine_similarity(embeddings[i], embeddings[j])

            if similarity > threshold:
                removed_indices.add(j)

                dedup_decisions.append({
                    'kept_index': i,
                    'kept_quote': moments[i]['quote'][:100],
                    'removed_index': j,
                    'removed_quote': moments[j]['quote'][:100],
                    'similarity': float(similarity),
                    'reason': 'semantic_similarity'
                })

    print(f"  ✅ Semantic dedup: {len(moments)} → {len(unique_moments)} moments ({len(removed_indices)} removed)", file=sys.stderr)

    return unique_moments, dedup_decisions


def global_reranking(moments, api_key, max_retries=3):
    """
    Send all candidate moments to AI for global reranking

    Args:
        moments: List of moment dictionaries
        api_key: OpenAI API key
        max_retries: Maximum retry attempts

    Returns:
        List of reranked moments sorted by priority
    """
    if not moments:
        return []

    print(f"  🎯 Global reranking of {len(moments)} candidates...", file=sys.stderr)

    # Prepare moment summaries for AI
    moment_summaries = []
    for i, m in enumerate(moments):
        moment_summaries.append(f"{i+1}. [{m.get('viral_score', 7.0)}] {m.get('speaker', 'Unknown')}: \"{m['quote'][:100]}...\"")

    prompt = f"""You are reviewing ALL candidate moments extracted from a parliamentary session.

Here are {len(moments)} candidate moments that were extracted:

{chr(10).join(moment_summaries)}

Your task:
1. Consider each moment's virality potential in the context of the FULL session
2. Re-score each moment if needed (some may be less unique when seeing all moments together)
3. Return ALL moments ranked by final priority (highest to lowest)

Prioritize:
- Unique perspectives (avoid multiple variations of the same point)
- Diversity of topics and speakers
- Mix of problematic and wholesome moments
- Truly standout content that will get shared

Return a JSON object with:
{{
  "ranked_moments": [
    {{
      "original_index": 0,
      "final_score": 8.5,
      "ranking_reason": "Brief explanation of ranking"
    }}
  ]
}}

Return all {len(moments)} moments in ranked order."""

    for attempt in range(max_retries):
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                },
                json={
                    'model': 'gpt-5-mini',
                    'messages': [
                        {'role': 'system', 'content': 'You are an expert content strategist. Return only valid JSON, no markdown.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'response_format': {'type': 'json_object'}
                },
                timeout=120
            )

            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"  ⚠️ Reranking rate limited, using original scores", file=sys.stderr)
                    return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

            if response.status_code != 200:
                print(f"  ⚠️ Reranking API error, using original scores", file=sys.stderr)
                return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

            result = response.json()
            ranking_data = json.loads(result['choices'][0]['message']['content'])
            ranked = ranking_data.get('ranked_moments', [])

            # Deduplicate by original_index (AI sometimes hallucinates duplicates)
            seen_indices = set()
            unique_ranked = []
            duplicates_found = 0
            for rank_info in ranked:
                idx = rank_info['original_index']
                if idx not in seen_indices:
                    seen_indices.add(idx)
                    unique_ranked.append(rank_info)
                else:
                    duplicates_found += 1

            if duplicates_found > 0:
                print(f"  ⚠️  Removed {duplicates_found} duplicate rankings from AI response", file=sys.stderr)

            # Apply new scores and reorder
            reranked_moments = []
            for rank_info in unique_ranked:
                idx = rank_info['original_index']
                if 0 <= idx < len(moments):
                    moment = moments[idx].copy()
                    moment['initial_score'] = moment.get('viral_score', 7.0)
                    moment['final_score'] = rank_info.get('final_score', moment['initial_score'])
                    moment['ranking_reason'] = rank_info.get('ranking_reason', '')
                    moment['global_ranking'] = len(reranked_moments) + 1
                    reranked_moments.append(moment)

            print(f"  ✅ Global reranking complete: {len(moments)} → {len(reranked_moments)} moments", file=sys.stderr)
            return reranked_moments

        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                time.sleep(wait_time)
            else:
                print(f"  ⚠️ Reranking failed: {e}, using original scores", file=sys.stderr)
                return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

    return moments
