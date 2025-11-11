#!/usr/bin/env python3
"""
Chunking strategies for YouTube and Hansard transcripts.
Provides smart chunking that respects content boundaries.
"""

import re
from .extraction_common import strip_html


def chunk_by_sections(data, max_chunk_size=60000, large_section_threshold=80000):
    """
    Chunk Hansard by section boundaries (respects Q&A structure).
    This ensures we don't cut exchanges in the middle.

    Args:
        data: Hansard data with takesSectionVOList
        max_chunk_size: Maximum size for combined chunks (default: 60k chars)
        large_section_threshold: Threshold for treating section as large (default: 80k chars)

    Returns:
        List of (chunk_text, metadata) tuples
    """
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

        if section_size > large_section_threshold:
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

        elif current_size + section_size > max_chunk_size:
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


def chunk_by_time(captions, chunk_duration=7200, overlap_duration=1200):
    """
    Chunk VTT captions by time with overlap.
    Creates chunks of approximately chunk_duration seconds with overlap_duration overlap.

    Args:
        captions: List of caption dictionaries with start_time, end_time, text
        chunk_duration: Duration of each chunk in seconds (default: 7200 = 2 hours)
        overlap_duration: Overlap between chunks in seconds (default: 1200 = 20 minutes)

    Returns:
        List of (chunk_captions, metadata) tuples
    """
    if not captions:
        return []

    chunks = []
    start_time = 0
    chunk_num = 1

    while start_time < captions[-1]['end_time']:
        end_time = start_time + chunk_duration

        # Get captions in this chunk (including overlap region)
        chunk_captions = [
            cap for cap in captions
            if cap['start_time'] < end_time and cap['end_time'] > start_time
        ]

        if not chunk_captions:
            break

        # Calculate actual chunk boundaries
        actual_start = chunk_captions[0]['start_time']
        actual_end = chunk_captions[-1]['end_time']

        # Determine if captions are in overlap region
        overlap_start = end_time - overlap_duration if end_time < captions[-1]['end_time'] else None

        for cap in chunk_captions:
            cap['is_in_overlap_region'] = (
                overlap_start is not None and
                cap['start_time'] >= overlap_start
            )

        metadata = {
            'chunk_id': f'chunk-{chunk_num:03d}',
            'start_time': actual_start,
            'end_time': actual_end,
            'duration': actual_end - actual_start,
            'caption_count': len(chunk_captions),
            'has_overlap': overlap_start is not None
        }

        chunks.append((chunk_captions, metadata))

        # Move to next chunk (with overlap)
        start_time = end_time - overlap_duration
        chunk_num += 1

    return chunks


def parse_vtt_captions(vtt_content):
    """
    Parse VTT file content into caption dictionaries.

    Args:
        vtt_content: String content of VTT file

    Returns:
        List of caption dictionaries with start_time, end_time, text
    """
    captions = []
    lines = vtt_content.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for timestamp line (HH:MM:SS.mmm --> HH:MM:SS.mmm)
        if '-->' in line:
            parts = line.split('-->')
            if len(parts) == 2:
                start_str = parts[0].strip()
                end_str = parts[1].strip().split()[0]  # Remove any extra data

                # Convert to seconds
                start_time = _vtt_timestamp_to_seconds(start_str)
                end_time = _vtt_timestamp_to_seconds(end_str)

                # Get caption text (next non-empty line)
                i += 1
                text_lines = []
                while i < len(lines) and lines[i].strip():
                    text_lines.append(lines[i].strip())
                    i += 1

                if text_lines:
                    captions.append({
                        'start_time': start_time,
                        'end_time': end_time,
                        'text': ' '.join(text_lines)
                    })

        i += 1

    return captions


def _vtt_timestamp_to_seconds(timestamp):
    """Convert VTT timestamp (HH:MM:SS.mmm) to seconds"""
    parts = timestamp.split(':')
    if len(parts) == 3:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    return 0.0
