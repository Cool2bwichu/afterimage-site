FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs ./
COPY lib ./lib
RUN mkdir -p /data/afterimage-generation-jobs \
  && chown -R node:node /app /data/afterimage-generation-jobs

ENV NODE_ENV=production \
    PORT=8788 \
    AFTERIMAGE_JOB_DIR=/data/afterimage-generation-jobs

USER node
EXPOSE 8788

CMD ["node", "server.mjs"]
