#!/usr/bin/env bash
# Harbor agent adapter for smol-agent.
#
# Harbor calls this script with the task instruction available at
# /task/instruction.md. The agent works inside /task/environment/
# (or /workspace if Harbor mounts it there). After completion, the
# verifier in /task/tests/ runs to grade the result.
#
# Environment variables (set by Harbor or the user):
#   SMOL_MODEL        - Model to use (default: from Harbor --model flag via $MODEL)
#   SMOL_PROVIDER     - Provider name (default: auto-detect from MODEL)
#   SMOL_HOST         - Provider host URL
#   SMOL_MAX_ITER     - Max agent iterations (default: 30)
#   SMOL_CONTEXT_SIZE - Context window size (default: 32768)
#   MODEL             - Set by Harbor's --model flag (LiteLLM format)
#
# Harbor convention: logs go to /logs/agent/

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────

INSTRUCTION_FILE="${INSTRUCTION_FILE:-/task/instruction.md}"
WORKSPACE="${WORKSPACE:-/task/environment}"
LOG_DIR="/logs/agent"
mkdir -p "$LOG_DIR"

# Read the task instruction
if [ ! -f "$INSTRUCTION_FILE" ]; then
  echo "ERROR: No instruction file found at $INSTRUCTION_FILE" | tee "$LOG_DIR/error.log"
  exit 1
fi

INSTRUCTION=$(cat "$INSTRUCTION_FILE")

# ── Model resolution ─────────────────────────────────────────────────
# Harbor passes --model in LiteLLM format (e.g., "anthropic/claude-sonnet-4-20250514").
# We need to map this to smol-agent's provider + model format.

HARBOR_MODEL="${MODEL:-${SMOL_MODEL:-}}"
PROVIDER="${SMOL_PROVIDER:-}"
AGENT_MODEL=""

if [ -n "$HARBOR_MODEL" ]; then
  # Parse LiteLLM format: "provider/model-name"
  if [[ "$HARBOR_MODEL" == *"/"* ]]; then
    LITELLM_PROVIDER="${HARBOR_MODEL%%/*}"
    AGENT_MODEL="${HARBOR_MODEL#*/}"

    # Map LiteLLM provider prefixes to smol-agent providers
    if [ -z "$PROVIDER" ]; then
      case "$LITELLM_PROVIDER" in
        anthropic)   PROVIDER="anthropic" ;;
        openai)      PROVIDER="openai" ;;
        ollama|ollama_chat) PROVIDER="ollama" ;;
        groq)        PROVIDER="groq" ;;
        xai)         PROVIDER="grok" ;;
        gemini|google) PROVIDER="gemini" ;;
        openrouter)  PROVIDER="custom-url" ;;
        *)           PROVIDER="custom-url" ;;
      esac
    fi
  else
    AGENT_MODEL="$HARBOR_MODEL"
  fi
fi

# Defaults
PROVIDER="${PROVIDER:-ollama}"
AGENT_MODEL="${AGENT_MODEL:-qwen2.5-coder:7b}"
HOST="${SMOL_HOST:-}"
MAX_ITER="${SMOL_MAX_ITER:-30}"
CTX_SIZE="${SMOL_CONTEXT_SIZE:-32768}"

# ── Build CLI args ───────────────────────────────────────────────────

ARGS=(
  "--provider" "$PROVIDER"
  "--model" "$AGENT_MODEL"
  "--directory" "$WORKSPACE"
  "--auto-approve"
)

if [ -n "$HOST" ]; then
  ARGS+=("--host" "$HOST")
fi

# ── Run the agent ────────────────────────────────────────────────────

echo "=== smol-agent Harbor adapter ===" | tee "$LOG_DIR/run.log"
echo "Provider: $PROVIDER" | tee -a "$LOG_DIR/run.log"
echo "Model:    $AGENT_MODEL" | tee -a "$LOG_DIR/run.log"
echo "Host:     ${HOST:-default}" | tee -a "$LOG_DIR/run.log"
echo "Workspace: $WORKSPACE" | tee -a "$LOG_DIR/run.log"
echo "Max iterations: $MAX_ITER" | tee -a "$LOG_DIR/run.log"
echo "=================================" | tee -a "$LOG_DIR/run.log"
echo "" | tee -a "$LOG_DIR/run.log"

# Run smol-agent headlessly via the programmatic Node.js API.
# This avoids the TUI and feeds the instruction directly.
node --no-warnings /app/smol-agent/harbor/run-headless.js \
  --provider "$PROVIDER" \
  --model "$AGENT_MODEL" \
  ${HOST:+--host "$HOST"} \
  --directory "$WORKSPACE" \
  --max-iterations "$MAX_ITER" \
  --context-size "$CTX_SIZE" \
  --instruction "$INSTRUCTION_FILE" \
  2>&1 | tee -a "$LOG_DIR/run.log"

EXIT_CODE=${PIPESTATUS[0]}

echo "" | tee -a "$LOG_DIR/run.log"
echo "Agent exited with code: $EXIT_CODE" | tee -a "$LOG_DIR/run.log"

exit $EXIT_CODE
