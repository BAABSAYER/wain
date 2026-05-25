# syntax=docker/dockerfile:1
# Wain API (NestJS). The workspace packages (@wain/db, @wain/routing, @wain/types)
# ship as TypeScript source, so the API is run with ts-node --transpile-only in
# production — the exact pipeline used in dev, so DI / decorator metadata behave
# identically. openssl is required by the Prisma query engine.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

# ---- install deps (cached on package.json changes only) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json       apps/api/package.json
COPY apps/web/package.json       apps/web/package.json
COPY apps/admin/package.json     apps/admin/package.json
COPY packages/db/package.json    packages/db/package.json
COPY packages/routing/package.json packages/routing/package.json
COPY packages/types/package.json   packages/types/package.json
RUN pnpm install --frozen-lockfile

# ---- build: copy source + generate Prisma client (Linux engine) ----
FROM deps AS build
COPY . .
RUN pnpm --filter @wain/db exec prisma generate

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 4000
# ts-node honours apps/api/tsconfig.json (paths + emitDecoratorMetadata).
CMD ["pnpm", "run", "start:prod"]
