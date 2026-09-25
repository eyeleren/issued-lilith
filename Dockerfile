# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/app/data
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data

VOLUME ["/app/data"]

HEALTHCHECK --interval=60s --timeout=10s --start-period=90s --retries=3 \
    CMD ["node", "scripts/healthcheck.js"]

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=192", "src/index.js"]
