# syntax=docker/dockerfile:1

# Production image for the Chaos Next.js app. The Convex backend runs as a
# separate container (see docker-compose.yml). Nothing secret is baked in. The
# NEXT_PUBLIC_* values are public by design but are inlined into the browser
# bundle at build time, so changing one requires rebuilding this image.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache libc6-compat
# Keep in step with the pnpm version pinned in .github/workflows/ci.yml.
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public, build-time values (see .env.example). Not secrets.
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_CONVEX_SITE_URL
ARG NEXT_PUBLIC_AUTH_PROVIDER=clerk
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_SOURCE_REPO_URL
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL \
    NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER \
    NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_SOURCE_REPO_URL=$NEXT_PUBLIC_SOURCE_REPO_URL \
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=$NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
# The build needs a syntactically valid Clerk secret key. This throwaway value
# exists only for this RUN step (not an ENV), so it is not in the final image.
# The real CLERK_SECRET_KEY is supplied at runtime.
RUN CLERK_SECRET_KEY="sk_test_build-placeholder-not-a-real-credential" pnpm build

# One-shot tool image that pushes convex/ to the self-hosted backend
# (`docker compose --profile deploy run --rm convex-deploy`). Not the app image.
FROM base AS convex-deploy
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY convex ./convex
# Convex modules also import shared documents, telemetry, plans and identity helpers.
COPY lib ./lib
COPY docker/convex-deploy.sh ./convex-deploy.sh
CMD ["sh", "./convex-deploy.sh"]

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
