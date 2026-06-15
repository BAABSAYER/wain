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
- `NEXT_PUBLIC_API_URL` = `/api` (the recommended default — works for any
  reverse-proxy / subdomain / IP without rebuilding)
- `APP_BASE_URL` = `http://<server-ip-or-host>:<HTTP_PORT>`
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` — **same value**.
- `AUTH_SECRET`, `ADMIN_PASSWORD` — strong secrets (`openssl rand -hex 32`).

> ℹ️ Only `ADMIN_BASE_PATH` is baked into the web/admin images at build time
> (the secret admin URL). `NEXT_PUBLIC_API_URL` defaults to `/api` (relative)
> so the front-end doesn't care about the domain/IP/port — change `APP_BASE_URL`
> or `HTTP_PORT` without rebuilding; only changing `ADMIN_BASE_PATH` needs
> `docker compose up -d --build`.
>
> Stuck after a bad build? Use `bash scripts/patch-baked-url.sh` — it patches
> the running bundle in seconds (no rebuild).

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

### Subdomain via existing nginx (optional)

A ready-to-use nginx server block lives at
[nginx/wain.baabsayer.sa.conf](nginx/wain.baabsayer.sa.conf). It terminates TLS
on the host, proxies everything to Wain's Caddy at `127.0.0.1:8787`, and keeps
all your other vhosts on the same nginx untouched.

```bash
# 1. Tell Wain about the public base URL (only APP_BASE_URL — it's runtime,
#    no rebuild). NEXT_PUBLIC_API_URL stays as the default `/api` (relative).
sed -i 's|^APP_BASE_URL=.*|APP_BASE_URL=https://wain.baabsayer.sa|' .env
docker compose up -d

# 2. Drop the server block into nginx and reload
sudo cp nginx/wain.baabsayer.sa.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/wain.baabsayer.sa.conf \
            /etc/nginx/sites-enabled/wain.baabsayer.sa.conf
sudo certbot --nginx -d wain.baabsayer.sa       # first time only
sudo nginx -t && sudo systemctl reload nginx
```

Then `https://wain.baabsayer.sa/` is the visitor app, `/api/*` is the API, and
your obscure admin path keeps working under the new domain. Nothing about the
Docker stack changes — Caddy still serves `:8787` on the loopback; you can drop
the subdomain anytime by removing the nginx block.

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
