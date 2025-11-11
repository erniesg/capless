#!/usr/bin/env python3
"""
Test moment extraction from Hansard transcript for Sept 22, 2025
Compare with YouTube extraction to see if it captures the "13 vs 15" moment
"""

import json
import sys
import os
import re
import requests
import time
import random
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

    required = ['OPENAI_API_KEY']
    missing = [k for k in required if k not in credentials]

    if missing:
        print(f"Error: Missing credentials in .dev.vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return credentials

creds = load_credentials()
OPENAI_API_KEY = creds['OPENAI_API_KEY']

def strip_html(html_text):
    """Strip HTML tags from text"""
    clean = re.sub('<[^<]+?>', '', html_text)
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()

def fetch_hansard(date_str):
    """Fetch Hansard transcript from Parliament API"""
    # Convert YYYY-MM-DD to DD-MM-YYYY
    parts = date_str.split('-')
    api_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

    url = f"https://sprs.parl.gov.sg/search/getHansardReport?sittingDate={api_date}"

    print(f"📥 Fetching Hansard from {url}...", file=sys.stderr)

    response = requests.get(url, timeout=30)

    if response.status_code != 200:
        print(f"❌ Failed to fetch: {response.status_code}", file=sys.stderr)
        return None

    data = response.json()

    # Extract sections
    sections = data.get('takesSectionVOList', [])

    if not sections:
        print(f"❌ No sections found in Hansard", file=sys.stderr)
        return None

    print(f"✅ Fetched Hansard: {len(sections)} sections", file=sys.stderr)

    return data

def chunk_by_sections(data):
    """Chunk recent structured transcripts by section boundaries with RICH METADATA"""
    sections = data.get('takesSectionVOList', [])

    if not sections:
        return []

    chunks = []
    current_chunk = []
    current_size = 0
    current_section_nums = []
    current_section_titles = []
    current_section_types = []

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
                    'chunk_id': f'chunk-{len(chunks)+1:03d}',
                    'sections': current_section_nums,
                    'section_titles': current_section_titles,
                    'section_types': current_section_types,
                    'type': 'combined',
                    'char_count': current_size
                }))
                current_chunk = []
                current_size = 0
                current_section_nums = []
                current_section_titles = []
                current_section_types = []

            # Add large section as its own chunk
            chunks.append((content_text, {
                'chunk_id': f'chunk-{len(chunks)+1:03d}',
                'sections': [i],
                'section_titles': [title],
                'section_types': [section_type],
                'type': 'large',
                'char_count': section_size
            }))

        elif current_size + section_size > 60000:
            # Current chunk would exceed limit - flush it
            if current_chunk:
                chunk_text = '\n\n'.join(current_chunk)
                chunks.append((chunk_text, {
                    'chunk_id': f'chunk-{len(chunks)+1:03d}',
                    'sections': current_section_nums,
                    'section_titles': current_section_titles,
                    'section_types': current_section_types,
                    'type': 'combined',
                    'char_count': current_size
                }))

            # Start new chunk with this section
            current_chunk = [content_text]
            current_size = section_size
            current_section_nums = [i]
            current_section_titles = [title]
            current_section_types = [section_type]

        else:
            # Add to current chunk
            current_chunk.append(content_text)
            current_size += section_size
            current_section_nums.append(i)
            current_section_titles.append(title)
            current_section_types.append(section_type)

    # Flush remaining chunk
    if current_chunk:
        chunk_text = '\n\n'.join(current_chunk)
        chunks.append((chunk_text, {
            'chunk_id': f'chunk-{len(chunks)+1:03d}',
            'sections': current_section_nums,
            'section_titles': current_section_titles,
            'section_types': current_section_types,
            'type': 'combined',
            'char_count': current_size
        }))

    return chunks

def extract_moments_from_chunk(chunk_text, chunk_metadata, max_retries=3):
    """Extract moments from a single chunk"""

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
- Controversial statistics or comparisons (e.g., "13 vs 15")

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
            print(f"🤖 Sending to GPT-5-mini (attempt {attempt+1}/{max_retries})...", file=sys.stderr)

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

            # Add rich metadata to each moment
            for moment in moments:
                moment['source_chunk_id'] = chunk_metadata['chunk_id']
                moment['source_sections'] = chunk_metadata['sections']
                moment['source_section_titles'] = chunk_metadata.get('section_titles', [])
                moment['chunk_metadata'] = chunk_metadata

            print(f"✅ Extracted {len(moments)} moments from {chunk_metadata['chunk_id']}", file=sys.stderr)

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

def main():
    date = '2025-09-22'

    print("="*60, file=sys.stderr)
    print("HANSARD MOMENT EXTRACTION TEST", file=sys.stderr)
    print(f"Date: {date}", file=sys.stderr)
    print("="*60, file=sys.stderr)
    print("", file=sys.stderr)

    # Fetch Hansard data
    hansard_data = fetch_hansard(date)

    if not hansard_data:
        print("❌ Failed to fetch Hansard", file=sys.stderr)
        sys.exit(1)

    # Save raw data for inspection
    raw_data_path = f'/tmp/hansard-{date}-raw.json'
    with open(raw_data_path, 'w') as f:
        json.dump(hansard_data, f, indent=2)
    print(f"💾 Saved raw data to {raw_data_path}", file=sys.stderr)

    # Calculate total length
    sections = hansard_data.get('takesSectionVOList', [])
    total_chars = sum(len(strip_html(s.get('content', ''))) for s in sections)
    print(f"📊 Total content: {total_chars:,} chars across {len(sections)} sections", file=sys.stderr)
    print("", file=sys.stderr)

    # Chunk by sections (respects Q&A boundaries)
    chunks = chunk_by_sections(hansard_data)
    print(f"📦 Created {len(chunks)} chunks (section-aware)", file=sys.stderr)

    # Print chunk summary with rich metadata
    for chunk_text, metadata in chunks:
        sections_str = ', '.join(map(str, metadata['sections']))
        titles_preview = metadata['section_titles'][0] if metadata['section_titles'] else 'N/A'
        print(f"  • {metadata['chunk_id']}: sections {sections_str} | {titles_preview}... | {metadata['char_count']:,} chars", file=sys.stderr)
    print("", file=sys.stderr)

    # Extract moments from each chunk
    all_moments = []

    for i, (chunk_text, metadata) in enumerate(chunks, 1):
        print(f"🔄 Processing chunk {i}/{len(chunks)} ({len(chunk_text):,} chars)...", file=sys.stderr)

        moments = extract_moments_from_chunk(chunk_text, metadata)

        if moments:
            all_moments.extend(moments)
            print(f"  ✅ Extracted {len(moments)} moments", file=sys.stderr)
        else:
            print(f"  ⚠️  No moments extracted", file=sys.stderr)

        # Rate limiting between chunks (2s safety buffer for 500 RPM limit)
        if i < len(chunks):
            print(f"  ⏳ Waiting 2s before next chunk...", file=sys.stderr)
            time.sleep(2)

        print("", file=sys.stderr)

    if not all_moments:
        print("❌ No moments extracted from any chunk", file=sys.stderr)
        sys.exit(1)

    # Prepare output with RICH METADATA
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

    # Save to file
    output_path = f'/tmp/hansard-moments-{date}.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print("", file=sys.stderr)
    print("="*60, file=sys.stderr)
    print("RESULTS", file=sys.stderr)
    print("="*60, file=sys.stderr)
    print(f"✅ Extracted {len(moments)} moments", file=sys.stderr)
    print(f"💾 Saved to {output_path}", file=sys.stderr)
    print("", file=sys.stderr)

    # Print moments
    for i, moment in enumerate(moments, 1):
        print(f"\n{i}. [{moment.get('viral_score', 0)}] {moment.get('title', 'N/A')}", file=sys.stderr)
        print(f"   Speaker: {moment.get('speaker', 'Unknown')}", file=sys.stderr)
        print(f"   Quote: \"{moment.get('quote', '')[:100]}...\"", file=sys.stderr)

    print("\n" + "="*60, file=sys.stderr)
    print("🔍 Check if '13 vs 15' moment was captured:", file=sys.stderr)

    found_13_vs_15 = False
    for moment in moments:
        quote = moment.get('quote', '').lower()
        if '13' in quote and '15' in quote:
            print(f"✅ FOUND! '{moment.get('quote', '')[:100]}...'", file=sys.stderr)
            found_13_vs_15 = True
            break

    if not found_13_vs_15:
        print("❌ NOT FOUND in extracted moments", file=sys.stderr)
        print("", file=sys.stderr)
        print("Let me search the full transcript:", file=sys.stderr)

        # Search transcript
        lines = transcript.split('\n')
        for i, line in enumerate(lines):
            if '13' in line and '15' in line and ('disruption' in line.lower() or 'service' in line.lower()):
                print(f"Found in transcript line {i}: {line[:200]}", file=sys.stderr)

    print("="*60, file=sys.stderr)

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
