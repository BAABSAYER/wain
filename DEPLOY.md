# Deploying Wain with Docker (single command)

The whole app runs in Docker behind a Caddy reverse proxy that serves everything
on **one plain-HTTP port** you choose — so it never collides with the busy
80/443/3000/5432 on a shared server. Deploy is a single command that builds,
starts, and seeds the database.

```
                    ┌──────────────── server ────────────────┐
 you ── :HTTP_PORT ─▶│ caddy                                   │
                    │   /api/*        → api   (NestJS :4000)   │
                    │   /<obscure>/*  → admin (Next  :3001)    │
                    │   /*            → web   (Next  :3000)    │
                    │              postgres :5432 (internal)   │
                    └──────────────────────────────────────────┘
```

Only `HTTP_PORT` is published to the host. The API, web, admin, and Postgres are
reachable **only on the internal Docker network** — nothing else touches the
host's ports.

---

## 1. Prerequisites

- A server with Docker + Docker Compose (`curl -fsSL https://get.docker.com | sh`).
- One free port for `HTTP_PORT` (default `8787` — change if taken).
- The code on the server (`git clone …` or copy the folder up).

## 2. Configure

```bash
cp .env.deploy.example .env
nano .env
```

Set:

- `HTTP_PORT` — any free port (e.g. `8787`, `19090`, …).
- `ADMIN_BASE_PATH` — your own random path, leading `/`, e.g. `/console-9f3k2x`.
- `NEXT_PUBLIC_API_URL` = `http://<server-ip-or-host>:<HTTP_PORT>/api`
- `APP_BASE_URL` = `http://<server-ip-or-host>:<HTTP_PORT>`
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` — **same value**.
- `AUTH_SECRET`, `ADMIN_PASSWORD` — strong secrets (`openssl rand -hex 32`).

> ⚠️ `NEXT_PUBLIC_API_URL`, `APP_BASE_URL`, `ADMIN_BASE_PATH`, `HTTP_PORT` are
> **baked into the web/admin images at build time**. If you change any of them
> later, rebuild: `docker compose up -d --build`.

## 3. Deploy — one command

```bash
docker compose up -d --build
```

That single command:
1. builds all three images,
2. starts Postgres → runs migrations (`migrate`) → starts the API,
3. waits until the API is healthy, then **seeds demo data** (`seed` service),
4. starts Caddy on `HTTP_PORT`.

Seeding is **idempotent** — if the database already has buildings it is skipped,
so re-running `docker compose up -d --build` to ship an update never duplicates
data. To control which demos load, set `SEED_SCRIPTS` in `.env`
(e.g. `SEED_SCRIPTS=seed-mall.mjs`). To start empty, set `SEED_SCRIPTS=` (blank).

## 4. Open it

- Visitor app: `http://<server-ip>:<HTTP_PORT>/`
- Admin panel: `http://<server-ip>:<HTTP_PORT><ADMIN_BASE_PATH>` (password = `ADMIN_PASSWORD`)
- API / Swagger: `http://<server-ip>:<HTTP_PORT>/api/docs`

Watch progress while it comes up:

```bash
docker compose ps
docker compose logs -f seed     # see the seeding + demo URLs
```

## HTTPS

Public HTTPS via Let's Encrypt needs ports 80/443, which is exactly what we're
avoiding here. If you want TLS, point your server's **existing** reverse proxy
(the one already using 80/443) at `http://127.0.0.1:<HTTP_PORT>`. The app is
same-origin, so no extra config is needed.

---

## Day-2 operations

```bash
# Update after a code change
git pull && docker compose up -d --build

# Logs
docker compose logs -f api

# Backup / restore the database
docker compose exec -T postgres pg_dump -U postgres wain > backup_$(date +%F).sql
cat backup.sql | docker compose exec -T postgres psql -U postgres wain

# Stop / start / wipe
docker compose down        # stop (keeps the DB volume)
docker compose up -d        # start again
docker compose down -v      # stop and wipe the DB
```

---

## Scaling (100 → 1000 users, config-only)

1. **Resize the server** (vertical first). 3D rendering is client-side; the
   server just serves JSON + static assets.
2. **Move Postgres off the box**: point `DATABASE_URL` at managed Postgres.
3. **Add Redis + more API replicas**: uncomment the `redis` service, move the
   cache (`apps/api/src/cache`) onto it, `docker compose up -d --scale api=3`,
   and load-balance in the Caddyfile.
4. **Batch analytics writes** before considering a message queue (not needed at
   1000 users).

| Concern        | Now (≤100)              | At ~1000                          |
|----------------|-------------------------|-----------------------------------|
| API instances  | 1 (stateless)           | 3 replicas + Caddy LB             |
| Cache          | in-process (built in)   | Redis (shared)                    |
| Database       | Postgres in compose     | managed Postgres (+ PgBouncer)    |
| Images         | base64 in Postgres      | object storage + CDN              |
| Message queue  | none (not needed)       | optional (BullMQ) for async jobs  |

---

## Notes

- The API runs via `ts-node --transpile-only` (workspace packages ship as TS
  source); it transpiles once at startup, not per request.
- `migrate` uses `prisma db push` (matches the current schema workflow). Switch
  to committed `prisma migrate` files before going fully production.
- The API refuses to boot in production if `AUTH_SECRET`/`ADMIN_PASSWORD` are
  unset or left at the dev defaults.
