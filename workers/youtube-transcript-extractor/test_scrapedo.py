#!/usr/bin/env python3
"""
Test scrape.do proxy with youtube-transcript-api
"""
import os
import sys
from youtube_transcript_api import YouTubeTranscriptApi

# scrape.do credentials
SCRAPE_DO_TOKEN = "99863f3851994a20a8222502e63bf6c28b6abb4cf6e"

# Configure proxy using scrape.do format
proxies = {
    'http': f'http://{SCRAPE_DO_TOKEN}:@proxy.scrape.do:8080',
    'https': f'http://{SCRAPE_DO_TOKEN}:@proxy.scrape.do:8080'
}

def test_extraction(video_id):
    """Test transcript extraction with scrape.do proxy"""
    print(f"🧪 Testing video: {video_id}")
    print(f"📡 Using scrape.do proxy: proxy.scrape.do:8080")
    print("")

    try:
        # Get transcript with proxy
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(
            video_id,
            languages=['en'],
            proxies=proxies
        )

        print(f"✅ SUCCESS!")
        print(f"📝 Found {len(transcript)} transcript entries")
        print(f"🎯 First entry: {transcript[0]}")
        print("")
        return True

    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        print("")
        return False

if __name__ == '__main__':
    print("=== scrape.do + youtube-transcript-api Test ===")
    print("")

    # Test videos
    test_videos = [
        ("dQw4w9WgXcQ", "Rick Astley - Never Gonna Give You Up"),
        ("n9ZyN-lwiXg", "Singapore Parliament Session")
    ]

    results = []
    for video_id, description in test_videos:
        print(f"Test: {description}")
        success = test_extraction(video_id)
        results.append((description, success))

    # Summary
    print("=" * 50)
    print("SUMMARY:")
    print("=" * 50)
    for desc, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{status} - {desc}")

    # Exit code
    all_passed = all(success for _, success in results)
    sys.exit(0 if all_passed else 1)
