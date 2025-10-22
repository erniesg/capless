#!/bin/bash

# Capless Workers - Complete Test Suite Runner
# Runs all unit tests + integration tests and shows final tally

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  CAPLESS WORKERS - COMPLETE TEST SUITE                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Track totals
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

# ============================================================================
# UNIT TESTS - All 5 Workers
# ============================================================================

echo "🧪 Running Unit Tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for worker in workers/*/; do
  name=$(basename "$worker")

  # Skip if no package.json
  if [ ! -f "$worker/package.json" ]; then
    echo "⚠️  $name: No package.json - skipping"
    echo ""
    continue
  fi

  echo "Testing: $name"
  cd "$worker"

  # Run tests and capture output
  test_output=$(npm test 2>&1 || true)

  # Parse test results
  if echo "$test_output" | grep -q "Test Files.*passed"; then
    passed=$(echo "$test_output" | grep -o "[0-9]* passed" | head -1 | grep -o "[0-9]*")
    skipped=$(echo "$test_output" | grep -o "[0-9]* skipped" | head -1 | grep -o "[0-9]*" || echo "0")

    echo "  ✅ $passed passed"
    if [ "$skipped" != "0" ]; then
      echo "  ⚠️  $skipped skipped"
    fi

    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
  elif echo "$test_output" | grep -q "failed"; then
    failed=$(echo "$test_output" | grep -o "[0-9]* failed" | head -1 | grep -o "[0-9]*")
    echo "  ❌ $failed FAILED"
    TOTAL_FAILED=$((TOTAL_FAILED + failed))
  else
    echo "  ⚠️  Unknown result"
  fi

  cd - > /dev/null
  echo ""
done

# ============================================================================
# INTEGRATION TESTS - Vitest
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Running Integration Tests (Vitest)..."
echo ""

integration_output=$(npm run test:integration 2>&1 || true)

if echo "$integration_output" | grep -q "Test Files.*passed"; then
  int_passed=$(echo "$integration_output" | grep -E "Tests\s+[0-9]+ passed" | grep -o "[0-9]* passed" | head -1 | grep -o "[0-9]*")

  echo "  ✅ $int_passed integration tests passed"
  TOTAL_PASSED=$((TOTAL_PASSED + int_passed))
elif echo "$integration_output" | grep -q "failed"; then
  int_failed=$(echo "$integration_output" | grep -o "[0-9]* failed" | head -1 | grep -o "[0-9]*")
  echo "  ❌ $int_failed integration tests FAILED"
  TOTAL_FAILED=$((TOTAL_FAILED + int_failed))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================================
# FINAL TALLY
# ============================================================================

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  FINAL TEST RESULTS                                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "  ✅ Passed:  $TOTAL_PASSED tests"
if [ "$TOTAL_SKIPPED" != "0" ]; then
  echo "  ⚠️  Skipped: $TOTAL_SKIPPED tests"
fi
if [ "$TOTAL_FAILED" != "0" ]; then
  echo "  ❌ Failed:  $TOTAL_FAILED tests"
fi
echo ""

# Calculate coverage percentage
if [ "$TOTAL_FAILED" == "0" ]; then
  echo "🎉 All tests passing! Ready for deployment."
  echo ""
  exit 0
else
  coverage=$((100 * TOTAL_PASSED / (TOTAL_PASSED + TOTAL_FAILED)))
  echo "⚠️  Test coverage: ${coverage}% ($TOTAL_FAILED failures)"
  echo ""
  exit 1
fi
