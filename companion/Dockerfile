# Build from the repository root (the companion reuses the site's film code in app/lib):
#   docker build -f companion/Dockerfile .
# railway.json at the repository root points Railway here.
FROM node:22-bookworm-slim

# Claude Code runs Claude on the owner's subscription (AFTERIMAGE_CLAUDE_AUTH=subscription).
# Pinned to the version the companion was verified against.
ARG CLAUDE_CODE_VERSION=2.1.284
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force

WORKDIR /srv/companion
COPY companion/package.json companion/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY companion/server.mjs ./
COPY companion/lib ./lib
COPY app/lib /srv/app/lib
RUN mkdir -p /data/afterimage-generation-jobs /srv/runtime

# Railway volumes mount as root, so the service runs as root like the GPT bridge.
# The allowed origin is this repository's GitHub Pages site; a service variable
# of the same name replaces it.
ENV NODE_ENV=production \
    PORT=8788 \
    AFTERIMAGE_ALLOWED_ORIGINS=https://cool2bwichu.github.io \
    AFTERIMAGE_JOB_DIR=/data/afterimage-generation-jobs \
    AFTERIMAGE_CLAUDE_WORKDIR=/srv/runtime \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8788

CMD ["node", "--experimental-strip-types", "server.mjs"]
