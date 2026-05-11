# syntax=docker/dockerfile:1.7

# -- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies (use a cache mount when BuildKit is enabled).
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy sources and build (client bundle, static assets, server bundle).
COPY tsconfig.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# -- Runtime stage -----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# Non-root user
RUN addgroup -S marken && adduser -S marken -G marken

# Copy the self-contained server bundle and static assets.
COPY --from=build --chown=marken:marken /app/dist ./dist

ENV NODE_ENV=production \
    PORT=8080 \
    MARKEN_VAULT_PATH=/vault

EXPOSE 8080
VOLUME ["/vault"]

USER marken

# Lightweight healthcheck — Node ships fetch in v22.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/tree').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
