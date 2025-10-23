#!/usr/bin/env python3
"""
Convert YouTube transcript to ProcessedTranscript format for moments extraction.
"""
import json
import sys
from pathlib import Path
from datetime import timedelta

def seconds_to_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format."""
    td = timedelta(seconds=seconds)
    hours, remainder = divmod(td.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

def convert_youtube_to_processed(youtube_transcript: list, sitting_date: str, video_id: str) -> dict:
    """
    Convert YouTube transcript to ProcessedTranscript format.

    Args:
        youtube_transcript: List of segments with start, duration, end, text
        sitting_date: Date in DD-MM-YYYY format
        video_id: YouTube video ID

    Returns:
        ProcessedTranscript dict
    """
    # Convert date format from DD-MM-YYYY to YYYY-MM-DD
    day, month, year = sitting_date.split('-')
    iso_date = f"{year}-{month}-{day}"

    # Create transcript_id
    transcript_id = f"youtube-{sitting_date}"

    segments = []
    for i, seg in enumerate(youtube_transcript):
        # Convert timestamps
        timestamp_start = seconds_to_timestamp(seg['start'])
        timestamp_end = seconds_to_timestamp(seg['end'])

        segments.append({
            "segment_id": f"seg-{i:05d}",
            "speaker": "Speaker",  # YouTube transcripts don't have speaker info
            "text": seg['text'],
            "timestamp_start": timestamp_start,
            "timestamp_end": timestamp_end,
            "section_title": "Parliament Session",  # Generic section
            "order": i
        })

    return {
        "transcript_id": transcript_id,
        "session_id": f"parliament-{iso_date}",
        "date": iso_date,
        "title": f"Parliament Session {sitting_date}",
        "segments": segments,
        "metadata": {
            "speakers": ["Speaker"],
            "topics": ["Parliament", "Debate"],
            "total_segments": len(segments),
            "video_id": video_id,
            "duration": youtube_transcript[-1]['end'] if youtube_transcript else 0
        }
    }

def main():
    if len(sys.argv) < 4:
        print("Usage: python convert-youtube-to-processed.py <youtube-transcript.json> <sitting-date> <video-id>")
        print("Example: python convert-youtube-to-processed.py output/youtube-transcript.json 26-09-2024 BbRLecFBH2g")
        sys.exit(1)

    input_file = Path(sys.argv[1])
    sitting_date = sys.argv[2]
    video_id = sys.argv[3]

    # Read YouTube transcript
    print(f"Reading YouTube transcript from {input_file}...")
    with open(input_file, 'r') as f:
        youtube_transcript = json.load(f)

    print(f"Found {len(youtube_transcript)} segments")

    # Convert to ProcessedTranscript format
    print(f"Converting to ProcessedTranscript format...")
    processed = convert_youtube_to_processed(youtube_transcript, sitting_date, video_id)

    # Save to output
    output_file = input_file.parent / "processed-transcript.json"
    print(f"Saving to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(processed, f, indent=2)

    # Print summary
    print(f"\n✅ Conversion complete!")
    print(f"   Transcript ID: {processed['transcript_id']}")
    print(f"   Date: {processed['date']}")
    print(f"   Segments: {processed['metadata']['total_segments']}")
    print(f"   Duration: {processed['metadata']['duration']:.1f} seconds ({processed['metadata']['duration']/3600:.1f} hours)")
    print(f"\nProcessed transcript saved to: {output_file}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
