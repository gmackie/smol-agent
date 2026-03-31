#!/usr/bin/env bash
# Verifier for multi-step task.
# Checks file creation and correct execution output.

set -euo pipefail

WORKSPACE="${WORKSPACE:-/task/environment}"
REWARD_FILE="/logs/verifier/reward.txt"
TOTAL_CHECKS=3
PASSED=0

echo "=== multi-step verifier ==="

# Check 1: math.js exists
if [ -f "$WORKSPACE/math.js" ]; then
  echo "PASS: math.js exists"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: math.js not found"
fi

# Check 2: test.js exists
if [ -f "$WORKSPACE/test.js" ]; then
  echo "PASS: test.js exists"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: test.js not found"
fi

# Check 3: Running test.js produces output containing "5"
if [ -f "$WORKSPACE/math.js" ] && [ -f "$WORKSPACE/test.js" ]; then
  OUTPUT=$(cd "$WORKSPACE" && node test.js 2>&1 || true)
  echo "test.js output: $OUTPUT"
  if echo "$OUTPUT" | grep -q '5'; then
    echo "PASS: output contains 5"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: output does not contain 5"
  fi
else
  echo "SKIP: cannot run test.js (missing files)"
fi

echo ""
echo "Checks passed: $PASSED/$TOTAL_CHECKS"

if [ "$PASSED" -ge 3 ]; then
  echo "1" > "$REWARD_FILE"
  echo "REWARD: 1"
else
  echo "0" > "$REWARD_FILE"
  echo "REWARD: 0"
fi
