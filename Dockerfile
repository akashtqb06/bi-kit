# =============================================================================
# Stage 1: deps — install production & build dependencies
# =============================================================================
FROM node:22-bookworm-slim AS deps

# Install build tools only needed for compiling native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-timeout 300000 && \
    pnpm install --frozen-lockfile

# =============================================================================
# Stage 2: builder — compile Next.js standalone and production CLI scripts
# =============================================================================
FROM node:22-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy placeholder to satisfy build-time module evaluation
ENV DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/bikit

RUN --mount=type=cache,target=/app/.next/cache pnpm build
RUN [ -f dist/migrate.cjs ] && [ -f dist/bootstrap.cjs ] && [ -f dist/validate-env.cjs ] || pnpm run build:scripts

# =============================================================================
# Stage 3: runner — lean, non-root production runtime
# =============================================================================
FROM node:22-bookworm-slim AS runner

# Install tini as lightweight init system and tzdata for timezone support
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Kolkata
ENV DATA_DIR=/app/data

# Dedicated non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 nextjs

# Copy standalone build and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# Copy entrypoint script
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Persistent app data folder and cache directory
RUN mkdir -p /app/data /app/.next/cache && \
    chown -R nextjs:nodejs /app/data /app/.next/cache

USER nextjs

EXPOSE 3000

# Healthcheck using Node.js without requiring curl
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const http = require('http'); const req = http.get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
