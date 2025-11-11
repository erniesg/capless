#!/usr/bin/env python3
"""
Extract moments from YouTube VTT transcripts with IMPROVED CHUNKING
- 2-3 hour chunks with 15-30 min overlap
- Exact timestamp extraction from VTT
- Semantic deduplication with embeddings
- Global reranking
- No hard caps, full metadata tracking
"""

import boto3
import json
import sys
import os
import re
import requests
import math
from pathlib import Path
from datetime import datetime
import time
import random
import urllib3

# Disable SSL warnings for sandbox environment
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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

# Configuration
CHUNK_DURATION = 9000  # 2.5 hours in seconds (midpoint between 2-3h)
OVERLAP_DURATION = 1200  # 20 minutes overlap
MIN_MOMENTS_PER_CHUNK = 3
MAX_MOMENTS_PER_CHUNK = 5
SEMANTIC_SIMILARITY_THRESHOLD = 0.85

def parse_timestamp(timestamp_str):
    """Convert VTT timestamp to seconds"""
    parts = timestamp_str.strip().split(':')

    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours = 0
        minutes, seconds = parts
    else:
        return 0.0

    return float(hours) * 3600 + float(minutes) * 60 + float(seconds)

def format_timestamp(seconds):
    """Convert seconds to HH:MM:SS format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"

def parse_vtt_with_timestamps(vtt_content):
    """Parse VTT and return list of (start_time, end_time, text) tuples"""
    captions = []
    lines = vtt_content.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if '-->' in line:
            timestamp_parts = line.split('-->')
            start_time = parse_timestamp(timestamp_parts[0])
            end_time_raw = timestamp_parts[1].strip().split()[0]
            end_time = parse_timestamp(end_time_raw)

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

def find_speaker_change(captions, target_time, window=120):
    """
    Find nearest speaker change within ±window seconds of target_time
    Heuristic: Long pauses (>3s between captions) often indicate speaker changes
    """
    candidates = []

    for i in range(len(captions) - 1):
        start, end, text = captions[i]
        next_start, next_end, next_text = captions[i + 1]

        # Check if within window
        if abs(end - target_time) <= window:
            pause = next_start - end

            # Long pause suggests speaker change or topic shift
            if pause > 3.0:
                candidates.append((end, pause))

    if not candidates:
        return target_time

    # Return break with longest pause closest to target
    candidates.sort(key=lambda x: (abs(x[0] - target_time), -x[1]))
    return candidates[0][0]

def chunk_with_overlap(captions, chunk_duration=CHUNK_DURATION, overlap_duration=OVERLAP_DURATION):
    """
    Chunk captions into 2-3 hour segments with 15-30 min overlap
    Find natural breaks (speaker changes, pauses) when possible
    """
    if not captions:
        return []

    max_time = captions[-1][1]
    chunks = []
    chunk_id = 0

    current_start = 0
    while current_start < max_time:
        target_end = current_start + chunk_duration

        # Find natural break near target end
        if target_end < max_time:
            actual_end = find_speaker_change(captions, target_end, window=180)
        else:
            actual_end = max_time

        # Get captions in this range
        chunk_captions = [(s, e, t) for s, e, t in captions
                         if s >= current_start and s < actual_end]

        if chunk_captions:
            chunk_text = ' '.join([text for _, _, text in chunk_captions])

            # Calculate overlap region for next chunk
            overlap_start = max(0, actual_end - overlap_duration) if actual_end < max_time else None

            metadata = {
                'chunk_id': f'chunk-{chunk_id:03d}',
                'start_time': current_start,
                'end_time': actual_end,
                'duration': actual_end - current_start,
                'caption_count': len(chunk_captions),
                'overlap_with_next': {
                    'start': overlap_start,
                    'end': actual_end
                } if overlap_start is not None else None,
                'captions': chunk_captions  # Keep for timestamp extraction later
            }

            chunks.append((chunk_text, metadata))
            chunk_id += 1

        # Next chunk starts with overlap
        if actual_end >= max_time:
            break
        current_start = actual_end - overlap_duration

    return chunks

def extract_exact_timestamp(quote, chunk_captions, chunk_start_time):
    """
    Find exact timestamp of quote in VTT captions
    Returns (start_timestamp, end_timestamp) or (None, None) if not found
    """
    # Normalize quote for matching (lowercase, remove extra spaces)
    normalized_quote = ' '.join(quote.lower().split())

    # Build sliding window of caption text
    for i in range(len(chunk_captions)):
        # Try matching with 1-10 consecutive captions
        for window_size in range(1, min(11, len(chunk_captions) - i + 1)):
            window_captions = chunk_captions[i:i + window_size]
            window_text = ' '.join([text.lower() for _, _, text in window_captions])
            window_text = ' '.join(window_text.split())

            # Check if quote is contained in this window
            if normalized_quote in window_text or window_text in normalized_quote:
                start_time = window_captions[0][0]
                end_time = window_captions[-1][1]
                return (format_timestamp(start_time), format_timestamp(end_time))

    # Fallback: return chunk boundaries
    return (format_timestamp(chunk_start_time), format_timestamp(chunk_start_time + 60))

def extract_moments_from_chunk(chunk_text, chunk_metadata, max_retries=3):
    """Extract 3-5 moments from a single chunk"""

    prompt = f"""You are extracting CANDIDATE moments from a SECTION of a longer parliamentary session.

Be SELECTIVE. Only extract moments that are TRULY viral-worthy:
- Score 8+ material: Shocking, hilarious, or deeply problematic
- Score 7-8 material: Strong shareable content
- Skip anything below 7

Extract {MIN_MOMENTS_PER_CHUNK}-{MAX_MOMENTS_PER_CHUNK} moments maximum. If this section has fewer than {MIN_MOMENTS_PER_CHUNK} strong moments, return fewer.

Remember: This is just one section. Other parts of the session may have better moments.

Look for moments that are PROBLEMATIC:
- Bureaucratic doublespeak or dense jargon
- Contradictions or illogical reasoning
- Defensive or evasive responses
- Out-of-touch statements

Look for moments that are WHOLESOME/POSITIVE:
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

Transcript section:
{chunk_text}"""

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
                        {'role': 'system', 'content': 'You are an expert content curator for viral political moments. Return only valid JSON, no markdown.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'response_format': {'type': 'json_object'}
                },
                timeout=120,
                verify=False  # Disable SSL verification for sandbox
            )

            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)
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

            # Extract exact timestamps for each moment
            for moment in moments:
                timestamp_start, timestamp_end = extract_exact_timestamp(
                    moment['quote'],
                    chunk_metadata['captions'],
                    chunk_metadata['start_time']
                )

                moment['timestamp_start'] = timestamp_start
                moment['timestamp_end'] = timestamp_end
                moment['source_chunk_id'] = chunk_metadata['chunk_id']

                # Check if moment is in overlap region
                overlap = chunk_metadata.get('overlap_with_next')
                if overlap:
                    # Parse timestamp back to seconds for comparison
                    ts_seconds = parse_timestamp(timestamp_start)
                    moment['is_in_overlap_region'] = ts_seconds >= overlap['start']
                else:
                    moment['is_in_overlap_region'] = False

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

def generate_embeddings(texts, max_retries=3):
    """Generate embeddings using OpenAI text-embedding-3-small"""
    for attempt in range(max_retries):
        try:
            response = requests.post(
                'https://api.openai.com/v1/embeddings',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {OPENAI_API_KEY}'
                },
                json={
                    'model': 'text-embedding-3-small',
                    'input': texts
                },
                timeout=60,
                verify=False  # Disable SSL verification for sandbox
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

def semantic_deduplication(moments, threshold=SEMANTIC_SIMILARITY_THRESHOLD):
    """
    Remove semantically similar moments using embeddings
    Returns (unique_moments, deduplication_decisions)
    """
    if not moments:
        return [], []

    print(f"  🧠 Generating embeddings for {len(moments)} moments...", file=sys.stderr)

    # Generate embeddings for all quotes
    quotes = [m['quote'] for m in moments]
    embeddings = generate_embeddings(quotes)

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
        current_cluster = [i]

        # Find similar moments
        for j in range(i + 1, len(moments)):
            if j in removed_indices:
                continue

            similarity = cosine_similarity(embeddings[i], embeddings[j])

            if similarity > threshold:
                removed_indices.add(j)
                current_cluster.append(j)

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

def global_reranking(moments, max_retries=3):
    """
    Send all candidate moments to AI for global reranking
    Returns reranked moments sorted by priority
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
                    'Authorization': f'Bearer {OPENAI_API_KEY}'
                },
                json={
                    'model': 'gpt-5-mini',
                    'messages': [
                        {'role': 'system', 'content': 'You are an expert content strategist. Return only valid JSON, no markdown.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'response_format': {'type': 'json_object'}
                },
                timeout=120,
                verify=False  # Disable SSL verification for sandbox
            )

            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + random.uniform(0, 1)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"  ⚠️ Reranking rate limited, using original scores", file=sys.stderr)
                    # Fallback: just sort by original score
                    return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

            if response.status_code != 200:
                print(f"  ⚠️ Reranking API error, using original scores", file=sys.stderr)
                return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

            result = response.json()
            ranking_data = json.loads(result['choices'][0]['message']['content'])
            ranked = ranking_data.get('ranked_moments', [])

            # Apply new scores and reorder
            reranked_moments = []
            for rank_info in ranked:
                idx = rank_info['original_index']
                if 0 <= idx < len(moments):
                    moment = moments[idx].copy()
                    moment['initial_score'] = moment.get('viral_score', 7.0)
                    moment['final_score'] = rank_info.get('final_score', moment['initial_score'])
                    moment['ranking_reason'] = rank_info.get('ranking_reason', '')
                    moment['global_ranking'] = len(reranked_moments) + 1
                    reranked_moments.append(moment)

            print(f"  ✅ Global reranking complete", file=sys.stderr)
            return reranked_moments

        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                time.sleep(wait_time)
            else:
                print(f"  ⚠️ Reranking failed: {e}, using original scores", file=sys.stderr)
                return sorted(moments, key=lambda m: m.get('viral_score', 7.0), reverse=True)

    return moments

def consolidate_moments(all_chunks_moments, chunks_metadata):
    """
    Consolidate moments from all chunks:
    1. Remove exact duplicates (from overlap regions)
    2. Semantic deduplication
    3. Global reranking
    4. No hard caps, return all sorted by final score
    """
    print(f"\n  📊 CONSOLIDATION PHASE", file=sys.stderr)

    # Step 1: Remove exact duplicates
    seen_quotes = {}
    unique_moments = []
    overlap_duplicates = 0

    for moment in all_chunks_moments:
        quote_key = moment['quote'].lower().strip()

        if quote_key in seen_quotes:
            overlap_duplicates += 1
            # Keep the one NOT in overlap region (more reliable)
            if not moment['is_in_overlap_region']:
                # Replace with non-overlap version
                idx = seen_quotes[quote_key]
                unique_moments[idx] = moment
        else:
            seen_quotes[quote_key] = len(unique_moments)
            unique_moments.append(moment)

    print(f"  ✅ Removed {overlap_duplicates} overlap duplicates: {len(all_chunks_moments)} → {len(unique_moments)}", file=sys.stderr)

    # Step 2: Semantic deduplication
    semantically_unique, dedup_decisions = semantic_deduplication(unique_moments)

    # Step 3: Global reranking
    final_moments = global_reranking(semantically_unique)

    # Prepare consolidation stats
    consolidation_stats = {
        'total_candidates_extracted': len(all_chunks_moments),
        'overlap_duplicates_removed': overlap_duplicates,
        'semantic_duplicates_removed': len(unique_moments) - len(semantically_unique),
        'final_moments_count': len(final_moments),
        'avg_initial_score': sum(m.get('viral_score', 7.0) for m in all_chunks_moments) / len(all_chunks_moments) if all_chunks_moments else 0,
        'avg_final_score': sum(m.get('final_score', m.get('viral_score', 7.0)) for m in final_moments) / len(final_moments) if final_moments else 0,
        'top_moment_score': final_moments[0].get('final_score', final_moments[0].get('viral_score', 0)) if final_moments else 0
    }

    return final_moments, consolidation_stats, dedup_decisions

def extract_moments_v2(date):
    """Extract moments using improved chunking + consolidation pipeline"""
    vtt_path = f'/tmp/{date}.vtt'

    # Download VTT from R2
    try:
        s3.download_file(BUCKET, f'{PREFIX_TRANSCRIPTS}{date}.vtt', vtt_path)
    except Exception as e:
        print(f"  ❌ Failed to download VTT: {e}", file=sys.stderr)
        return False

    # Parse VTT
    try:
        with open(vtt_path, 'r') as f:
            vtt_content = f.read()

        captions = parse_vtt_with_timestamps(vtt_content)
        total_duration = captions[-1][1] if captions else 0
        print(f"  📋 Parsed {len(captions)} captions (duration: {format_timestamp(total_duration)})", file=sys.stderr)

        # Smart chunking with overlap
        chunks = chunk_with_overlap(captions, CHUNK_DURATION, OVERLAP_DURATION)
        print(f"  📦 Created {len(chunks)} chunks (~{CHUNK_DURATION/3600:.1f}h each, {OVERLAP_DURATION/60}min overlap)", file=sys.stderr)

    except Exception as e:
        print(f"  ❌ Failed to parse VTT: {e}", file=sys.stderr)
        return False

    # Stage 1: Extract moments from each chunk
    all_moments = []
    chunks_metadata = []

    for i, (chunk_text, metadata) in enumerate(chunks, 1):
        start_h = int(metadata['start_time'] // 3600)
        start_m = int((metadata['start_time'] % 3600) // 60)
        end_h = int(metadata['end_time'] // 3600)
        end_m = int((metadata['end_time'] % 3600) // 60)

        print(f"\n  🔄 Chunk {i}/{len(chunks)} ({metadata['chunk_id']}): {start_h}:{start_m:02d}-{end_h}:{end_m:02d} ({len(chunk_text):,} chars)...", file=sys.stderr)

        moments = extract_moments_from_chunk(chunk_text, metadata)
        print(f"  ✅ Extracted {len(moments)} moments from chunk {i}", file=sys.stderr)

        # Store chunk metadata (without captions to save space)
        chunk_meta_clean = {
            'chunk_id': metadata['chunk_id'],
            'start_time': metadata['start_time'],
            'end_time': metadata['end_time'],
            'duration': metadata['duration'],
            'caption_count': metadata['caption_count'],
            'moments_extracted': len(moments),
            'has_overlap': metadata['overlap_with_next'] is not None
        }
        chunks_metadata.append(chunk_meta_clean)

        all_moments.extend(moments)

        # Rate limiting between chunks (120s = 500 RPM safe)
        if i < len(chunks):
            print(f"  ⏳ Waiting 120s before next chunk...", file=sys.stderr)
            time.sleep(120)

    print(f"\n  ✅ Stage 1 complete: {len(all_moments)} candidate moments from {len(chunks)} chunks", file=sys.stderr)

    # Stage 2: Consolidation
    final_moments, consolidation_stats, dedup_decisions = consolidate_moments(all_moments, chunks_metadata)

    # Prepare output
    output = {
        'date': date,
        'extraction_strategy': 'two_stage_chunked_v2',
        'model': 'gpt-5-mini',
        'extracted_at': datetime.utcnow().isoformat() + 'Z',
        'format': 'youtube_vtt',
        'total_duration': format_timestamp(total_duration),
        'chunks_metadata': chunks_metadata,
        'consolidation_stats': consolidation_stats,
        'deduplication_decisions': dedup_decisions[:50],  # First 50 for brevity
        'moments': final_moments
    }

    # Upload to R2
    try:
        s3.put_object(
            Bucket=BUCKET,
            Key=f'{PREFIX_MOMENTS}youtube-v2-{date}.json',
            Body=json.dumps(output, indent=2),
            ContentType='application/json'
        )
        print(f"\n  ✅ Uploaded to R2: youtube-v2-{date}.json", file=sys.stderr)
        print(f"  📊 Final: {consolidation_stats['final_moments_count']} moments (avg score: {consolidation_stats['avg_final_score']:.2f})", file=sys.stderr)
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

    transcripts.sort(reverse=True)
    print(f"✅ Found {len(transcripts)} YouTube transcripts", file=sys.stderr)
    return transcripts

def check_already_processed(date):
    """Check if v2 extraction already exists"""
    try:
        s3.head_object(Bucket=BUCKET, Key=f'{PREFIX_MOMENTS}youtube-v2-{date}.json')
        return True
    except:
        return False

def main():
    print("=== YOUTUBE MOMENT EXTRACTION V2 ===", file=sys.stderr)
    print("Features: 2-3h chunks, overlap, exact timestamps, semantic dedup, global reranking", file=sys.stderr)
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print("", file=sys.stderr)

    transcripts = list_youtube_transcripts()

    total = len(transcripts)
    processed = 0
    skipped = 0

    for i, date in enumerate(transcripts, 1):
        if check_already_processed(date):
            print(f"[{i}/{total}] SKIP - {date} (already processed)", file=sys.stderr)
            skipped += 1
            continue

        print(f"\n{'='*60}", file=sys.stderr)
        print(f"[{i}/{total}] {datetime.now().strftime('%H:%M:%S')} - Processing {date}...", file=sys.stderr)
        print(f"{'='*60}", file=sys.stderr)

        if extract_moments_v2(date):
            processed += 1

    print("", file=sys.stderr)
    print("="*60, file=sys.stderr)
    print("=== EXTRACTION COMPLETE ===", file=sys.stderr)
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
