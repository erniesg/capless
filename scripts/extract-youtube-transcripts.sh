#!/bin/bash
# Local YouTube Transcript Extraction Script
# Uses yt-dlp with Chrome cookies to bypass YouTube's anti-bot protections
# Then uploads transcripts to Cloudflare R2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TEMP_DIR="/tmp/youtube-transcripts"
PYENV_VERSION="innovasian"
R2_BUCKET="capless-preview"
R2_PREFIX="youtube/transcripts"

# Usage function
usage() {
    echo "Usage: $0 [video_id] [date]"
    echo ""
    echo "Examples:"
    echo "  $0 dQw4w9WgXcQ 22-09-2024"
    echo "  $0                          # Process from parliament-youtube-sessions.csv"
    echo ""
    exit 1
}

# Setup function
setup() {
    echo -e "${YELLOW}=== YouTube Transcript Extractor (Local)${NC}"
    echo ""

    # Create temp directory
    mkdir -p "$TEMP_DIR"

    # Check yt-dlp
    if ! command -v yt-dlp &> /dev/null; then
        echo -e "${RED}Error: yt-dlp not found${NC}"
        echo "Install with: brew install yt-dlp"
        exit 1
    fi

    # Check wrangler
    if ! command -v npx &> /dev/null; then
        echo -e "${RED}Error: npx not found${NC}"
        echo "Install Node.js first"
        exit 1
    fi

    echo -e "${GREEN}✓ Environment ready${NC}"
    echo ""
}

# Extract transcript for a single video
extract_transcript() {
    local video_id=$1
    local date=$2
    local output_file="$TEMP_DIR/${date}"

    echo -e "${YELLOW}Processing: $video_id (date: $date)${NC}"

    # Extract transcript using yt-dlp with Chrome cookies
    PYENV_VERSION=$PYENV_VERSION yt-dlp \
        --cookies-from-browser chrome \
        --write-auto-sub \
        --sub-lang en \
        --skip-download \
        --output "$output_file" \
        "https://www.youtube.com/watch?v=${video_id}" 2>&1 | grep -v "Deleting original file"

    # Check if VTT file was created
    local vtt_file="${output_file}.en.vtt"
    if [ ! -f "$vtt_file" ]; then
        echo -e "${RED}✗ No transcript found for $video_id${NC}"
        return 1
    fi

    local size=$(wc -c < "$vtt_file" | tr -d ' ')
    echo -e "${GREEN}✓ Extracted transcript: ${size} bytes${NC}"

    # Upload to R2
    echo "  Uploading to R2..."
    npx wrangler r2 object put "$R2_BUCKET/$R2_PREFIX/${date}.vtt" \
        --file "$vtt_file" 2>&1 | grep -v "Uploaded"

    echo -e "${GREEN}✓ Uploaded to R2: $R2_PREFIX/${date}.vtt${NC}"

    # Cleanup
    rm "$vtt_file"

    return 0
}

# Process from CSV file
process_csv() {
    local csv_file="$1"

    if [ ! -f "$csv_file" ]; then
        echo -e "${RED}Error: CSV file not found: $csv_file${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Processing videos from CSV...${NC}"
    echo ""

    local total=0
    local success=0
    local failed=0

    # Skip header and process each line
    tail -n +2 "$csv_file" | while IFS=',' read -r date video_id url; do
        total=$((total + 1))

        if extract_transcript "$video_id" "$date"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi

        echo ""
        sleep 2  # Rate limiting
    done

    echo -e "${GREEN}=== Summary ===${NC}"
    echo "Total: $total"
    echo "Success: $success"
    echo "Failed: $failed"
}

# Main execution
main() {
    setup

    if [ $# -eq 0 ]; then
        # No arguments - look for CSV file
        csv_file="../parliament-youtube-sessions.csv"
        if [ -f "$csv_file" ]; then
            process_csv "$csv_file"
        else
            echo -e "${YELLOW}No CSV file found. Usage:${NC}"
            usage
        fi
    elif [ $# -eq 2 ]; then
        # Single video mode
        extract_transcript "$1" "$2"
    else
        usage
    fi

    # Cleanup temp directory
    rm -rf "$TEMP_DIR"
}

main "$@"
