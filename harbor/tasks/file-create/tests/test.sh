#!/usr/bin/env bash
# Verifier for file-create task.
# Checks that hello.js exists, exports a hello function, and returns the correct string.

set -euo pipefail

WORKSPACE="${WORKSPACE:-/task/environment}"
REWARD_FILE="/logs/verifier/reward.txt"
TOTAL_CHECKS=4
PASSED=0

echo "=== file-create verifier ==="

# Check 1: File exists
if [ -f "$WORKSPACE/hello.js" ]; then
  echo "PASS: hello.js exists"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: hello.js not found"
  echo "0" > "$REWARD_FILE"
  exit 0
fi

CONTENT=$(cat "$WORKSPACE/hello.js")

# Check 2: Has a function named hello
if echo "$CONTENT" | grep -qE 'function\s+hello|const\s+hello|let\s+hello|var\s+hello'; then
  echo "PASS: has hello function"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: no hello function found"
fi

# Check 3: Contains the correct string
if echo "$CONTENT" | grep -q 'Hello, world!'; then
  echo "PASS: contains 'Hello, world!'"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: missing 'Hello, world!' string"
fi

# Check 4: Has export
if echo "$CONTENT" | grep -qE 'module\.exports|export\s'; then
  echo "PASS: has export"
  PASSED=$((PASSED + 1))
else
  echo "FAIL: no export found"
fi

# Compute reward (1 if >=75% checks pass, 0 otherwise)
echo ""
echo "Checks passed: $PASSED/$TOTAL_CHECKS"

if [ "$PASSED" -ge 3 ]; then
  echo "1" > "$REWARD_FILE"
  echo "REWARD: 1"
else
  echo "0" > "$REWARD_FILE"
  echo "REWARD: 0"
fi
