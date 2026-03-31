#!/usr/bin/env bash
# Verifier for bug-fix task.
# Checks that the fibonacci function returns the correct value.

set -euo pipefail

WORKSPACE="${WORKSPACE:-/task/environment}"
REWARD_FILE="/logs/verifier/reward.txt"
TOTAL_CHECKS=3
PASSED=0

echo "=== bug-fix verifier ==="

# Check 1: fib.js exists
if [ ! -f "$WORKSPACE/fib.js" ]; then
  echo "FAIL: fib.js not found"
  echo "0" > "$REWARD_FILE"
  exit 0
fi

echo "PASS: fib.js exists"
PASSED=$((PASSED + 1))

CONTENT=$(cat "$WORKSPACE/fib.js")

# Check 2: The loop bound bug is fixed (i <= n or equivalent)
if echo "$CONTENT" | grep -qE 'i\s*<=\s*n|i\s*<\s*n\s*\+\s*1|i\s*<\s*n\+1'; then
  echo "PASS: loop bound corrected"
  PASSED=$((PASSED + 1))
else
  # Could be a different valid fix — check runtime
  echo "INFO: loop bound pattern not found, checking runtime"
fi

# Check 3: Running fib.js outputs 8 for fibonacci(6)
OUTPUT=$(cd "$WORKSPACE" && node -e "
  const m = require('./fib.js');
  const result = m.fibonacci(6);
  console.log(result);
" 2>&1 || true)
echo "fibonacci(6) = $OUTPUT"

if echo "$OUTPUT" | grep -q '^8$'; then
  echo "PASS: fibonacci(6) returns 8"
  PASSED=$((PASSED + 1))
  # If runtime is correct, count it even if pattern check missed
  if [ "$PASSED" -eq 2 ]; then
    PASSED=3
  fi
else
  echo "FAIL: fibonacci(6) does not return 8 (got: $OUTPUT)"
fi

echo ""
echo "Checks passed: $PASSED/$TOTAL_CHECKS"

if [ "$PASSED" -ge 2 ]; then
  echo "1" > "$REWARD_FILE"
  echo "REWARD: 1"
else
  echo "0" > "$REWARD_FILE"
  echo "REWARD: 0"
fi
