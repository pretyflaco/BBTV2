# Production Dockerfile for BlinkPOS
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
# Copy patches directory for patch-package postinstall
COPY patches ./patches
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# v52: NEXT_PUBLIC_* variables must be set at build time for Next.js
# They get inlined into the JavaScript bundle during build
ENV NEXT_PUBLIC_USE_NDK_NIP46=true

# Git commit hash for build versioning (passed from docker-compose or build command)
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

# Limit Node.js memory to avoid OOM on low-memory servers
# Disable webpack cache to save disk space during build
ENV NODE_OPTIONS="--max-old-space-size=512"

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database init script for health checks
COPY --from=builder /app/database ./database

# Create .data directory for user session storage with proper permissions
USER root
RUN mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data
USER nextjs

EXPOSE 3000

ENV PORT 3000

# Install wget for health checks
USER root
RUN apk add --no-cache wget
USER nextjs

CMD ["node", "server.js"]

