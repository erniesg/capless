#!/usr/bin/env python3
"""
Test yt-dlp with scrape.do proxy
Using scrape.do's proxy mode with Python
"""
import os
import sys
import json
import yt_dlp

# scrape.do credentials - must be set via environment variable
# Set via: export SCRAPE_DO_TOKEN="your-token"
SCRAPE_DO_TOKEN = os.environ.get('SCRAPE_DO_TOKEN')
if not SCRAPE_DO_TOKEN:
    print("ERROR: SCRAPE_DO_TOKEN environment variable not set")
    print("Set it via: export SCRAPE_DO_TOKEN='your-token'")
    sys.exit(1)

# Configure scrape.do proxy (proxy mode)
# Format: http://TOKEN:super=true@proxy.scrape.do:8080
proxy_url = f"http://{SCRAPE_DO_TOKEN}:super=true@proxy.scrape.do:8080"

def test_extraction(video_id, date):
    """Test transcript extraction with yt-dlp + scrape.do"""
    print(f"🧪 Testing: {video_id} ({date})")
    print(f"📡 Proxy: proxy.scrape.do:8080")
    print("")

    output_path = f"/tmp/yt-test-{date}"

    ydl_opts = {
        'proxy': proxy_url,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'skip_download': True,
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': False,
        'nocheckcertificate': True,  # Disable SSL verification for scrape.do proxy
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print("⏳ Extracting transcript...")
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

            # Download subtitles
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

            vtt_file = f"{output_path}.en.vtt"
            if os.path.exists(vtt_file):
                size = os.path.getsize(vtt_file)
                print(f"✅ SUCCESS!")
                print(f"📄 VTT file: {vtt_file}")
                print(f"📏 Size: {size} bytes")

                # Show first few lines
                with open(vtt_file, 'r') as f:
                    lines = f.readlines()[:10]
                    print(f"🎯 Preview:")
                    print(''.join(lines))

                # Cleanup
                os.remove(vtt_file)
                return True
            else:
                print(f"❌ No VTT file created")
                return False

    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=== yt-dlp + scrape.do Proxy Test ===")
    print("")

    # Test video
    video_id = "dQw4w9WgXcQ"
    date = "2025-01-05"

    success = test_extraction(video_id, date)

    print("")
    print("=" * 50)
    if success:
        print("✅ TEST PASSED - scrape.do proxy works with yt-dlp!")
    else:
        print("❌ TEST FAILED")
    print("=" * 50)

    sys.exit(0 if success else 1)
