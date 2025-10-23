#!/usr/bin/env python3
"""Convert VTT subtitles to ProcessedTranscript format"""

import json
import re
import sys
from typing import List, Dict

def parse_timestamp(ts: str) -> str:
    """Convert VTT timestamp to HH:MM:SS format"""
    # VTT format: 00:30:04.320
    parts = ts.split(':')
    hours, minutes, seconds_ms = parts[0], parts[1], parts[2].split('.')[0]
    return f"{hours}:{minutes}:{seconds_ms}"

def parse_vtt(vtt_path: str) -> List[Dict]:
    """Parse VTT file into segments"""
    segments = []
    with open(vtt_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    i = 0
    segment_id = 0
    current_text = ""
    current_start = None
    current_end = None
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip header and empty lines
        if not line or line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:'):
            i += 1
            continue
        
        # Check if this is a timestamp line
        if '-->' in line:
            timestamps = line.split('-->')
            start_ts = timestamps[0].strip().split(' ')[0]
            end_ts = timestamps[1].strip().split(' ')[0]
            
            current_start = parse_timestamp(start_ts)
            current_end = parse_timestamp(end_ts)
            
            # Read next line for text
            i += 1
            if i < len(lines):
                text_line = lines[i].strip()
                # Clean up VTT formatting tags
                text_line = re.sub(r'<\d+:\d+:\d+\.\d+>', '', text_line)
                text_line = re.sub(r'<c>', '', text_line)
                text_line = re.sub(r'</c>', '', text_line)
                text_line = re.sub(r'</?[^>]+>', '', text_line)
                
                if text_line and current_start and current_end:
                    segments.append({
                        "segment_id": f"seg-{segment_id:05d}",
                        "speaker": "Speaker",  # VTT doesn't have speaker info
                        "text": text_line,
                        "timestamp_start": current_start,
                        "timestamp_end": current_end,
                        "order": segment_id
                    })
                    segment_id += 1
        
        i += 1
    
    return segments

def create_processed_transcript(segments: List[Dict], transcript_id: str, date: str, title: str) -> Dict:
    """Create ProcessedTranscript format"""
    speakers = list(set([seg["speaker"] for seg in segments]))
    
    return {
        "transcript_id": transcript_id,
        "session_id": transcript_id,
        "date": date,
        "title": title,
        "segments": segments,
        "metadata": {
            "speakers": speakers,
            "total_segments": len(segments)
        }
    }

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: convert-vtt-to-processed.py INPUT.vtt OUTPUT.json TRANSCRIPT_ID DATE [TITLE]")
        print("Example: convert-vtt-to-processed.py input.vtt output.json parliament-22-09-2024 22-09-2024 'Parliament Session'")
        sys.exit(1)
    
    vtt_path = sys.argv[1]
    output_path = sys.argv[2]
    transcript_id = sys.argv[3]
    date = sys.argv[4]
    title = sys.argv[5] if len(sys.argv) > 5 else f"Parliament Session {date}"
    
    print(f"Parsing VTT file: {vtt_path}")
    segments = parse_vtt(vtt_path)
    
    print(f"Found {len(segments)} segments")
    
    transcript = create_processed_transcript(segments, transcript_id, date, title)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transcript, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Converted to ProcessedTranscript: {output_path}")
    print(f"  Segments: {len(segments)}")
    print(f"  First segment: {segments[0]['text'][:60]}...")
