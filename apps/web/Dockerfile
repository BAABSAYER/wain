# syntax=docker/dockerfile:1
# Wain visitor app (Next.js, standalone output). NEXT_PUBLIC_API_URL is baked at
# build time, so it must point at the public API URL (https://<domain>/api).

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
COPY apps/admin/scripts/copy-ifc-wasm.mjs apps/admin/scripts/copy-ifc-wasm.mjs
COPY packages/db/package.json    packages/db/package.json
COPY packages/routing/package.json packages/routing/package.json
COPY packages/types/package.json   packages/types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @wain/web build

# ---- slim runtime: only the standalone server + static assets ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
