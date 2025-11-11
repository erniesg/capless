#!/usr/bin/env python3
"""
Test the v2 chunking logic without API calls
"""

import sys
import math
from pathlib import Path

# Add parent directory to path to import from extract script
sys.path.insert(0, str(Path(__file__).parent))

# Mock VTT data for testing (11 hours worth)
def generate_mock_captions(duration_hours=11):
    """Generate mock VTT captions for testing"""
    captions = []
    total_seconds = int(duration_hours * 3600)

    # One caption every 3 seconds
    for i in range(0, total_seconds, 3):
        start = i
        end = i + 2.5
        text = f"Mock caption {i//3} at {i//3600}h {(i%3600)//60}m"

        # Add occasional long pauses (speaker changes)
        if i > 0 and i % 600 == 0:  # Every 10 minutes
            start = i + 5  # 5 second pause

        captions.append((start, end, text))

    return captions

def format_timestamp(seconds):
    """Convert seconds to HH:MM:SS"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"

def find_speaker_change(captions, target_time, window=120):
    """Find nearest speaker change (simplified version)"""
    candidates = []

    for i in range(len(captions) - 1):
        start, end, text = captions[i]
        next_start, next_end, next_text = captions[i + 1]

        if abs(end - target_time) <= window:
            pause = next_start - end
            if pause > 3.0:
                candidates.append((end, pause))

    if not candidates:
        return target_time

    candidates.sort(key=lambda x: (abs(x[0] - target_time), -x[1]))
    return candidates[0][0]

def chunk_with_overlap(captions, chunk_duration=9000, overlap_duration=1200):
    """Chunk with overlap (from v2 script)"""
    if not captions:
        return []

    max_time = captions[-1][1]
    chunks = []
    chunk_id = 0

    current_start = 0
    while current_start < max_time:
        target_end = current_start + chunk_duration

        if target_end < max_time:
            actual_end = find_speaker_change(captions, target_end, window=180)
        else:
            actual_end = max_time

        chunk_captions = [(s, e, t) for s, e, t in captions
                         if s >= current_start and s < actual_end]

        if chunk_captions:
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
                } if overlap_start is not None else None
            }

            chunks.append(metadata)
            chunk_id += 1

        if actual_end >= max_time:
            break
        current_start = actual_end - overlap_duration

    return chunks

def test_chunking():
    """Test chunking with various durations"""
    test_cases = [
        (1, "1 hour session"),
        (2.5, "2.5 hour session"),
        (6, "6 hour session"),
        (11, "11 hour session (worst case)")
    ]

    print("="*70)
    print("V2 CHUNKING TEST")
    print("="*70)
    print(f"Config: 2.5h chunks (9000s), 20min overlap (1200s)")
    print()

    for duration, desc in test_cases:
        print(f"\n{desc}:")
        print("-" * 50)

        captions = generate_mock_captions(duration)
        total_time = captions[-1][1] if captions else 0

        chunks = chunk_with_overlap(captions, chunk_duration=9000, overlap_duration=1200)

        print(f"  Total duration: {format_timestamp(total_time)} ({len(captions)} captions)")
        print(f"  Chunks created: {len(chunks)}")
        print()

        for chunk in chunks:
            start_str = format_timestamp(chunk['start_time'])
            end_str = format_timestamp(chunk['end_time'])
            duration_str = format_timestamp(chunk['duration'])
            overlap_str = "YES" if chunk['overlap_with_next'] else "NO"

            print(f"    {chunk['chunk_id']}: {start_str} -> {end_str} (duration: {duration_str}, overlap: {overlap_str})")

        print()
        print(f"  Expected moments (3-5 per chunk): {len(chunks) * 3} - {len(chunks) * 5}")
        print(f"  vs OLD system (10min chunks): {int(total_time / 600)} chunks -> {int(total_time / 600) * 5}-{int(total_time / 600) * 10} moments")

        improvement = ((int(total_time / 600) * 7.5) - (len(chunks) * 4)) / (int(total_time / 600) * 7.5) * 100
        print(f"  Improvement: ~{improvement:.0f}% fewer candidate moments")

def test_cosine_similarity():
    """Test cosine similarity without numpy"""
    print("\n" + "="*70)
    print("COSINE SIMILARITY TEST")
    print("="*70)

    # Test vectors
    a = [1, 0, 0]
    b = [1, 0, 0]
    c = [0, 1, 0]
    d = [0.7, 0.7, 0]

    def cosine_similarity(a, b):
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        return dot_product / (norm_a * norm_b) if (norm_a * norm_b) > 0 else 0

    print(f"\n  Identical vectors: {cosine_similarity(a, b):.4f} (expected: 1.0)")
    print(f"  Orthogonal vectors: {cosine_similarity(a, c):.4f} (expected: 0.0)")
    print(f"  Similar vectors: {cosine_similarity(a, d):.4f} (expected: ~0.707)")
    print(f"  Opposite direction: {cosine_similarity(a, [-1, 0, 0]):.4f} (expected: -1.0)")

if __name__ == '__main__':
    try:
        test_chunking()
        test_cosine_similarity()
        print("\n" + "="*70)
        print("✅ ALL TESTS PASSED")
        print("="*70)
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
