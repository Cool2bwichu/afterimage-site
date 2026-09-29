FROM node:22-bookworm-slim

# Claude Code runs Claude on the owner's subscription (AFTERIMAGE_CLAUDE_AUTH=subscription).
# Pinned to the version the companion was verified against.
ARG CLAUDE_CODE_VERSION=2.1.284
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs ./
COPY lib ./lib
RUN mkdir -p /data/afterimage-generation-jobs /app/runtime \
  && chown -R node:node /app /data/afterimage-generation-jobs

ENV NODE_ENV=production \
    PORT=8788 \
    AFTERIMAGE_JOB_DIR=/data/afterimage-generation-jobs \
    AFTERIMAGE_CLAUDE_WORKDIR=/app/runtime \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

USER node
EXPOSE 8788

CMD ["node", "server.mjs"]
