# Use bun as the base image
FROM oven/bun:1.2.18-slim AS builder

WORKDIR /app

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Dummy values for build-time validation
# These are required by packages/env/src/web.ts schema parsing
ENV NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_MARBLE_API_URL=https://api.marblecms.com
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
ENV BETTER_AUTH_SECRET=placeholder_secret_at_least_32_characters_long
ENV UPSTASH_REDIS_REST_URL=https://dummy.upstash.io
ENV UPSTASH_REDIS_REST_TOKEN=dummy_token
ENV MARBLE_WORKSPACE_KEY=dummy_key
ENV FREESOUND_CLIENT_ID=dummy_id
ENV FREESOUND_API_KEY=dummy_key
ENV CLOUDFLARE_ACCOUNT_ID=dummy_id
ENV R2_ACCESS_KEY_ID=dummy_key
ENV R2_SECRET_ACCESS_KEY=dummy_key
ENV R2_BUCKET_NAME=dummy_bucket
ENV MODAL_TRANSCRIPTION_URL=https://dummy.modal.run

# Copy workspace configuration
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/env/package.json ./packages/env/

# Install dependencies
RUN bun install

# Copy the rest of the source code
COPY . .

# Build the application
RUN bun run build:web

# Final runner image
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy files from builder stage
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

# Next.js monorepo standalone structure puts the app entry point here:
CMD ["node", "apps/web/server.js"]
