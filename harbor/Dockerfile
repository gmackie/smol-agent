# Harbor base environment for smol-agent.
#
# This Dockerfile sets up the runtime environment that Harbor uses
# to execute smol-agent against tasks. It installs Node.js, the
# smol-agent source, and dependencies.
#
# Task-specific Dockerfiles can extend this with:
#   FROM smol-agent-harbor AS base

FROM node:20-slim

# Install common utilities agents might need
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up smol-agent
WORKDIR /app/smol-agent
COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src/ ./src/
COPY harbor/ ./harbor/

# Create log directories Harbor expects
RUN mkdir -p /logs/agent /logs/verifier

# Default workspace
WORKDIR /task/environment

# The agent.sh script is the Harbor entry point
ENTRYPOINT ["/app/smol-agent/harbor/agent.sh"]
