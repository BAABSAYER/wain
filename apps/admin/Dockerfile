# syntax=docker/dockerfile:1
# Wain admin panel (Next.js, standalone output). Served under an obscure base
# path (ADMIN_BASE_PATH) so it lives at a hard-to-guess URL on the same domain.
# Both NEXT_PUBLIC_API_URL and ADMIN_BASE_PATH are baked at build time.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json       apps/api/package.json
COPY apps/web/package.json       apps/web/package.json
COPY apps/admin/package.json     apps/admin/package.json
COPY packages/db/package.json    packages/db/package.json
COPY packages/routing/package.json packages/routing/package.json
COPY packages/types/package.json   packages/types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG ADMIN_BASE_PATH
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV ADMIN_BASE_PATH=$ADMIN_BASE_PATH
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @wain/admin build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /app/apps/admin/public ./apps/admin/public
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
