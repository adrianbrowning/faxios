FROM node:24-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm && corepack use pnpm@latest-10

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
# Add Claude and user pnpm store to PATH
ENV PATH="/home/agent/.local/bin:/home/agent/.local/share/pnpm:$PATH"
ENV PNPM_HOME="/home/agent/.local/share/pnpm"

# Bake public skills into the image — avoids per-sandbox install overhead.
# Private repos (tealiumlabs) are installed at runtime via onSandboxReady.
RUN pnpm dlx skills add mattpocock/skills \
      --skill tdd --skill code-review \
      -a claude-code -g --copy -y && \
    pnpm dlx skills add mcollina/skills \
      --skill node \
      -a claude-code -g --copy -y && \
    pnpm dlx skills add DietrichGebert/ponytail \
      --skill ponytail \
      -a claude-code -g --copy -y

RUN claude plugin marketplace add mksglu/context-mode && \
    claude plugin install context-mode@context-mode

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
