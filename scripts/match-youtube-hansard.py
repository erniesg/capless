#!/usr/bin/env python3
"""
Match YouTube Parliament videos with Hansard dates
"""
import re
import json
from datetime import datetime
from pathlib import Path

# Parse YouTube video titles to extract dates
def parse_date_from_title(title):
    """
    Examples:
    "Parliament Sitting 18 February 2025" -> 2025-02-18
    "Parliament Sitting 9 September 2024" -> 2024-09-09
    """
    # Match pattern: "day month year"
    pattern = r'(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})'
    match = re.search(pattern, title)

    if not match:
        return None

    day, month_name, year = match.groups()
    month_map = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
    }

    month = month_map[month_name]
    date_str = f"{year}-{month:02d}-{int(day):02d}"

    return date_str

# Read YouTube video files
youtube_dir = Path("/Users/erniesg/code/erniesg/capless/youtube-sessions")
video_map = {}

for parliament_file in ["14th-parliament-videos.txt", "15th-parliament-videos.txt"]:
    file_path = youtube_dir / parliament_file
    if not file_path.exists():
        continue

    with open(file_path) as f:
        for line in f:
            if '|' not in line:
                continue

            parts = line.strip().split('|')
            if len(parts) < 2:
                continue

            video_id, title = parts[0], parts[1]

            # Skip deleted/private videos
            if '[Deleted' in title or '[Private' in title:
                continue

            # Parse date from title
            date = parse_date_from_title(title)
            if not date:
                continue

            # Skip English interpretation versions (keep main version)
            is_interpretation = 'English interpretation' in title or 'English Interpretation' in title

            if date not in video_map or not is_interpretation:
                video_map[date] = {
                    'video_id': video_id,
                    'title': title,
                    'url': f'https://www.youtube.com/watch?v={video_id}',
                    'is_interpretation': is_interpretation
                }

# Sort by date
sorted_dates = sorted(video_map.keys())

print("=== YOUTUBE PARLIAMENT SESSIONS ===\n")
print(f"Total sessions with YouTube videos: {len(sorted_dates)}\n")

# Group by year
by_year = {}
for date in sorted_dates:
    year = date[:4]
    if year not in by_year:
        by_year[year] = []
    by_year[year].append(date)

for year in sorted(by_year.keys()):
    print(f"\n{year}: {len(by_year[year])} sessions")
    for date in by_year[year]:
        video = video_map[date]
        print(f"  {date}: {video['url']}")

# Check for specific test date
print("\n=== TEST DATE CHECK ===")
test_date = "2024-09-22"
if test_date in video_map:
    print(f"✅ {test_date} - YouTube video exists:")
    print(f"   {video_map[test_date]['url']}")
else:
    print(f"❌ {test_date} - NO YouTube video found")
    print(f"   Closest sessions:")
    # Find closest dates
    all_2024_sept = [d for d in sorted_dates if d.startswith('2024-09')]
    for d in all_2024_sept:
        print(f"   {d}: {video_map[d]['url']}")

# Save mapping to JSON
output_file = youtube_dir / "youtube-hansard-mapping.json"
with open(output_file, 'w') as f:
    json.dump(video_map, f, indent=2)

print(f"\n✅ Mapping saved to: {output_file}")
