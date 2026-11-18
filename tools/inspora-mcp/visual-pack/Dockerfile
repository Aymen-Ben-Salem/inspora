# Inspora MCP visual-pack builder. Build context: tools/inspora-mcp (see Dockerfile.dockerignore).
# Node 22.23.5 on Debian bookworm, pinned by digest; ffmpeg from Debian; sharp and zod pinned by the lockfile.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Dependencies install at /app so both /app/*.mjs (shared with the CLI) and the server resolve them.
COPY visual-pack/package.json visual-pack/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY prepare-visuals.mjs visuals.mjs enrichment.mjs ./
COPY visual-pack/server.mjs ./visual-pack/
# standard-1 gives half a vCPU: a 21 s 1716x1076 recording decodes in about 40 s, so allow up to 5 minutes for long clips.
ENV NODE_ENV=production PORT=8080 VISUAL_FFMPEG_TIMEOUT_MS=300000
USER node
EXPOSE 8080
CMD ["node", "visual-pack/server.mjs"]
