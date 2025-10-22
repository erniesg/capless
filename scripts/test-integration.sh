#!/bin/bash
# Integration test runner for Capless pipeline
# Runs all 5 worker integration tests plus end-to-end pipeline test

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Capless Integration Test Suite ===${NC}\n"

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v npx &> /dev/null; then
    echo -e "${RED}Error: npx not found. Please install Node.js.${NC}"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Warning: wrangler not found globally. Will use npx wrangler.${NC}"
fi

# Check if Playwright is installed
if ! npx playwright --version &> /dev/null; then
    echo -e "${YELLOW}Playwright not found. Installing...${NC}"
    npm install
    npx playwright install
fi

# Parse arguments
TEST_FILTER=${1:-""}
HEADED=${2:-""}

if [ "$HEADED" = "--headed" ]; then
    HEADED_FLAG="--headed"
else
    HEADED_FLAG=""
fi

echo -e "${GREEN}Starting integration tests...${NC}\n"

# Function to run specific test suite
run_test() {
    local test_name=$1
    local test_file=$2

    echo -e "${YELLOW}Running: $test_name${NC}"

    if npx playwright test "$test_file" $HEADED_FLAG; then
        echo -e "${GREEN}✓ $test_name passed${NC}\n"
        return 0
    else
        echo -e "${RED}✗ $test_name failed${NC}\n"
        return 1
    fi
}

# Track test results
FAILED_TESTS=()
PASSED_TESTS=()

# Run tests based on filter
if [ -z "$TEST_FILTER" ] || [ "$TEST_FILTER" = "all" ]; then
    echo "Running all integration tests..."

    run_test "Ingestion Worker" "ingestion.integration.spec.ts" && PASSED_TESTS+=("Ingestion") || FAILED_TESTS+=("Ingestion")
    run_test "Video Matcher Worker" "video-matcher.integration.spec.ts" && PASSED_TESTS+=("VideoMatcher") || FAILED_TESTS+=("VideoMatcher")
    run_test "Moments Worker" "moments.integration.spec.ts" && PASSED_TESTS+=("Moments") || FAILED_TESTS+=("Moments")
    run_test "Asset Generator Worker" "asset-generator.integration.spec.ts" && PASSED_TESTS+=("AssetGenerator") || FAILED_TESTS+=("AssetGenerator")
    run_test "Video Compositor Worker" "video-compositor.integration.spec.ts" && PASSED_TESTS+=("VideoCompositor") || FAILED_TESTS+=("VideoCompositor")
    run_test "End-to-End Pipeline" "pipeline.e2e.spec.ts" && PASSED_TESTS+=("E2E") || FAILED_TESTS+=("E2E")

elif [ "$TEST_FILTER" = "ingestion" ]; then
    run_test "Ingestion Worker" "ingestion.integration.spec.ts"

elif [ "$TEST_FILTER" = "video-matcher" ]; then
    run_test "Video Matcher Worker" "video-matcher.integration.spec.ts"

elif [ "$TEST_FILTER" = "moments" ]; then
    run_test "Moments Worker" "moments.integration.spec.ts"

elif [ "$TEST_FILTER" = "asset-generator" ]; then
    run_test "Asset Generator Worker" "asset-generator.integration.spec.ts"

elif [ "$TEST_FILTER" = "video-compositor" ]; then
    run_test "Video Compositor Worker" "video-compositor.integration.spec.ts"

elif [ "$TEST_FILTER" = "e2e" ] || [ "$TEST_FILTER" = "pipeline" ]; then
    run_test "End-to-End Pipeline" "pipeline.e2e.spec.ts"

else
    echo -e "${RED}Unknown test filter: $TEST_FILTER${NC}"
    echo "Usage: $0 [all|ingestion|video-matcher|moments|asset-generator|video-compositor|e2e|pipeline] [--headed]"
    exit 1
fi

# Print summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo -e "Passed: ${#PASSED_TESTS[@]}"
echo -e "Failed: ${#FAILED_TESTS[@]}"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "\n${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  - $test"
    done
    exit 1
else
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
fi
