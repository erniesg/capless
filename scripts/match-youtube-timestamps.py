#!/usr/bin/env python3
"""
Match YouTube VTT timestamps with Hansard moments
"""
import json
import re
from datetime import time, timedelta

def parse_vtt_timestamp(ts_str):
    """Convert VTT timestamp to seconds: '00:30:05.279' -> 1805.279"""
    h, m, s = ts_str.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

def parse_vtt(vtt_path):
    """Parse VTT file and return list of (start_sec, end_sec, text)"""
    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    segments = []
    pattern = r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}).*?\n(.*?)(?=\n\n|\Z)'
    
    for match in re.finditer(pattern, content, re.DOTALL):
        start_ts, end_ts, text = match.groups()
        start_sec = parse_vtt_timestamp(start_ts)
        end_sec = parse_vtt_timestamp(end_ts)
        
        # Clean text: remove XML tags and extra whitespace
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        if text:
            segments.append({
                'start_seconds': start_sec,
                'end_seconds': end_sec,
                'text': text
            })
    
    return segments

def find_quote_in_transcript(quote, transcript_segments, window=120):
    """
    Find the best matching segment for a quote
    Returns (start_seconds, confidence_score)
    """
    # Normalize quote for matching
    quote_clean = ' '.join(quote.lower().split())
    quote_words = set(quote_clean.split())
    
    best_match = None
    best_score = 0
    
    # Search through segments with a sliding window
    for i, seg in enumerate(transcript_segments):
        # Get context window (current + next few segments)
        window_text = ' '.join([
            transcript_segments[j]['text'] 
            for j in range(i, min(i + 10, len(transcript_segments)))
        ]).lower()
        
        window_words = set(window_text.split())
        
        # Calculate word overlap score
        overlap = len(quote_words & window_words)
        score = overlap / len(quote_words) if quote_words else 0
        
        if score > best_score:
            best_score = score
            best_match = seg['start_seconds']
    
    return best_match, best_score

def main():
    # Load YouTube VTT transcript
    print("Loading YouTube VTT transcript...")
    vtt_path = 'youtube-transcripts/2025-09-22.en.vtt'
    transcript_segments = parse_vtt(vtt_path)
    print(f"  ✅ Loaded {len(transcript_segments)} segments")
    
    # Load moments (NOTE: using correct year 2025, not 2024)
    print("\nLoading moments...")
    moments_path = 'test-outputs/22-09-2024/moments-simple.json'  # Using cleaned simple version
    with open(moments_path, 'r') as f:
        moments_data = json.load(f)
    
    moments = moments_data.get('moments', [])
    print(f"  ✅ Loaded {len(moments)} moments")
    
    # Match each moment with YouTube timestamp
    print("\nMatching moments with YouTube timestamps...")
    enhanced_moments = []
    
    for i, moment in enumerate(moments, 1):
        quote = moment.get('quote', '')
        print(f"\n[{i}/{len(moments)}] Matching: {quote[:60]}...")
        
        start_sec, confidence = find_quote_in_transcript(quote, transcript_segments)
        
        if start_sec:
            print(f"  ✅ Found at {int(start_sec//60)}:{int(start_sec%60):02d} (confidence: {confidence:.1%})")
            moment['youtube_start_seconds'] = int(start_sec)
            moment['youtube_timestamp'] = f"{int(start_sec//60)}:{int(start_sec%60):02d}"
            moment['youtube_url'] = f"https://www.youtube.com/watch?v=n9ZyN-lwiXg&t={int(start_sec)}s"
            moment['timestamp_confidence'] = round(confidence, 3)
        else:
            print(f"  ⚠️  No match found")
            moment['youtube_start_seconds'] = None
            moment['youtube_timestamp'] = None
            moment['youtube_url'] = None
            moment['timestamp_confidence'] = 0
        
        enhanced_moments.append(moment)
    
    # Save enhanced moments
    output_path = 'test-outputs/22-09-2024/moments-with-youtube-timestamps.json'
    output_data = {
        **moments_data,
        'moments': enhanced_moments,
        'youtube_video_id': 'n9ZyN-lwiXg',
        'youtube_mapping_complete': True
    }
    
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n✅ Enhanced moments saved to: {output_path}")
    
    # Summary
    matched = sum(1 for m in enhanced_moments if m.get('youtube_start_seconds'))
    print(f"\n=== SUMMARY ===")
    print(f"Total moments: {len(enhanced_moments)}")
    print(f"Matched: {matched}/{len(enhanced_moments)} ({matched/len(enhanced_moments)*100:.1f}%)")

if __name__ == '__main__':
    main()
