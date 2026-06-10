# GoPlan Production Runbook (Homelab)

Operates the production stack defined in `podman-compose.prod.yml`: PostgreSQL,
Redis, Django backend (Daphne/ASGI), Celery workers, scheduler, and the
Next.js frontend — all in containers, no source mounts, behind a Cloudflare
Tunnel.

Placeholders used throughout: `app.example.com` (web app domain) and
`api.example.com` (WebSocket domain). Replace with your real domains; real
values belong in local env files only — **never commit them**.

---

## 1. First-time setup

### 1.1 Host prerequisites

- `git`, `podman`, `podman-compose` (or a compose provider for `podman compose`)
- `cloudflared` installed as a system service (token mode)

### 1.2 Get the code

```sh
git clone <repo-url> GoPlan
cd GoPlan
git checkout <production branch or tag>
```

### 1.3 Create the four local env files

All are gitignored. Templates document every variable and its classification
(public/server-only, build-time/runtime, secret).

```sh
cp backend/.env.example backend/.env            # Django runtime config
cp backend/db.env.example backend/db.env        # PostgreSQL credentials
cp frontend/.env.example frontend/.env.local    # frontend runtime config
```

Create the repo-root `.env` (compose build args for the frontend image —
public values only):

```sh
cat > .env <<'EOF'
NEXT_PUBLIC_APP_BASE_URL=https://app.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com
NEXT_ALLOWED_DEV_ORIGINS=
NEXT_ENABLE_HSTS=1
EOF
```

Then edit `backend/.env` and `frontend/.env.local` following the PRODUCTION
notes inside each template. Key points:

- Generate secrets:
  ```sh
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # DJANGO_SECRET_KEY
  python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # GOPLAN_INTERNAL_PROXY_SECRET
  ```
- `GOPLAN_INTERNAL_PROXY_SECRET` must be identical in `backend/.env` and
  `frontend/.env.local`.
- `DB_NAME/DB_USER/DB_PASSWORD` in `backend/.env` must match
  `POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD` in `backend/db.env`.
- `DJANGO_SECURE_SSL_REDIRECT=0` — TLS terminates at the Cloudflare edge; the
  BFF talks plain HTTP to the backend on the compose network.

### 1.4 Cloudflare Tunnel routes

Create a tunnel (dashboard → Zero Trust → Networks → Tunnels, token mode) and
publish exactly these application routes:

| Hostname | Path | Service | Purpose |
|---|---|---|---|
| `app.example.com` | `*` | `http://localhost:3000` | Web app + BFF HTTP API |
| `api.example.com` | `^/ws/realtime$` | `http://localhost:8000` | WebSocket realtime only |
| Catch-all | | `http_status:404` | Everything else on the API domain |

The 404 catch-all is **intentional**: browsers never call Django over HTTP
(BFF architecture), so Django's HTTP surface (admin, schema, API) stays off
the internet. Do not "fix" a 404 on `api.example.com` by adding routes.

### 1.5 Build and start

```sh
podman compose -f podman-compose.prod.yml config   # sanity-check env wiring
podman compose -f podman-compose.prod.yml up -d --build
```

The backend container runs `manage.py migrate` automatically before starting
Daphne. First build takes several minutes (frontend `npm ci` + `next build`).

### 1.6 Smoke checklist

```sh
podman ps                                            # 7 containers, DB/Redis healthy
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/auth/me    # 401
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/login        # 200
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/auth/me  # 401
# WebSocket — MUST use --http1.1, otherwise curl negotiates HTTP/2, drops the
# Upgrade header, and you get a misleading 404:
curl -s -o /dev/null -w '%{http_code}\n' --http1.1 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Origin: https://app.example.com' \
  https://api.example.com/ws/realtime                                          # 101
```

Then log in through the browser and send a chat message to confirm the
authenticated realtime flow.

---

## 2. Deploy an update

### Branch model

- `main` — application source of truth. Features and fixes are developed on
  branches off `main` and merged via PR. Never deployed directly.
- `production` (this branch) — always `main` plus production deploy config
  only (this runbook, the prod compose file, the frontend Containerfile, env
  templates). Never merged back into `main`; no feature work happens here.
- A release = on the dev machine: `git checkout production && git merge main
  && git push`. Merge conflicts are resolved there, never on this host — this
  host only ever pulls a clean fast-forward.

### Update commands

```sh
cd GoPlan
git pull
podman compose -f podman-compose.prod.yml up -d --build
podman image prune -f        # drop superseded image layers
```

Notes:

- `up -d --build` only recreates containers whose image or config changed.
- Database migrations run automatically when the backend container starts.
- Changing any `NEXT_PUBLIC_*` value (root `.env`) requires a frontend image
  **rebuild** — they are baked into the JS bundle at build time. Changing
  runtime env (`backend/.env`, `frontend/.env.local`) only needs:
  ```sh
  podman compose -f podman-compose.prod.yml up -d --force-recreate <service>
  ```

---

## 3. Restart / stop

```sh
podman compose -f podman-compose.prod.yml restart backend      # one service
podman compose -f podman-compose.prod.yml restart              # everything
podman compose -f podman-compose.prod.yml down                 # stop stack (volumes survive)
```

Never use `down -v` casually — `-v` deletes the database, Redis, and media
volumes.

---

## 4. Logs

```sh
podman compose -f podman-compose.prod.yml logs -f backend      # Django/Daphne
podman logs -f frontend-goplan                                 # Next.js
podman logs -f backend-worker-goplan                           # Celery worker
podman logs -f backend-memory-render-worker-goplan             # memory render queue
podman logs -f backend-scheduler-goplan                        # scheduler loop
podman logs --tail 100 postgres-db-goplan
journalctl -u cloudflared -f                                   # tunnel (systemd hosts)
```

Health signals: Daphne logs `Listening on TCP address 0.0.0.0:8000`; workers
log `celery@... ready.`; `podman inspect <name> --format '{{.RestartCount}}'`
should stay at 0.

---

## 5. Backup and rollback

### 5.1 Backup (run before every risky change)

```sh
mkdir -p ~/goplan-backups
podman exec postgres-db-goplan sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > ~/goplan-backups/goplan-$(date +%Y%m%d-%H%M%S).sql
# Media files (user uploads):
podman volume export goplan_mediadata > ~/goplan-backups/mediadata-$(date +%Y%m%d-%H%M%S).tar
```

### 5.2 Roll back code

```sh
git log --oneline -10                      # find the last good commit
git checkout <good-commit>
podman compose -f podman-compose.prod.yml up -d --build
```

Caveat: rolling back code does **not** roll back applied database migrations.
If the bad release introduced a migration, restore the database dump from
before the deploy (5.3) or write a reverse migration — do not improvise
destructive fixes.

### 5.3 Restore the database

```sh
podman compose -f podman-compose.prod.yml stop backend backend-worker \
  backend-memory-render-worker backend-scheduler
podman exec -i postgres-db-goplan sh -c \
  'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
podman exec -i postgres-db-goplan sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < ~/goplan-backups/<dump-file>.sql
podman compose -f podman-compose.prod.yml up -d
```

---

## 6. Dev and prod on the same machine

Both compose files share the project name (`goplan`), container names, and
volumes. Run only one stack at a time:

```sh
podman compose -f podman-compose.prod.yml down   # leaving prod
podman compose up -d                             # entering dev (and vice versa)
```

Data in `goplan_pgdata` / `goplan_redisdata` / `goplan_mediadata` survives
switching in both directions.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Container crash-loops and `up -d --force-recreate` doesn't replace it | podman-compose may skip a restarting container. `podman rm -f <name>` (remove dependents first — frontend depends on backend), then `up -d`. |
| `ModuleNotFoundError: No module named 'media'` in backend | `media/` is a Django **app**, not the upload dir. It must never be listed in `backend/.containerignore` (uploads live in `media_files/`). |
| WebSocket probe returns 404 but the app works | curl used HTTP/2 and dropped the `Upgrade` header. Probe with `--http1.1`. |
| HTTP paths on `api.example.com` return 404 | By design (see 1.4). Not a bug. |
| Backend answers `400 Bad Request` on direct `127.0.0.1:8000` | Host not in `DJANGO_ALLOWED_HOSTS`. Internal calls use the `backend` hostname; this is expected for loopback probes. |
| Backend answers `301` to every BFF call | `DJANGO_SECURE_SSL_REDIRECT` is on while traffic is plain HTTP. Set it to `0` (TLS terminates at the edge). |
| Frontend container builds but `NEXT_PUBLIC_*` values look stale | They are build-time. Rebuild the image: `up -d --build frontend`. |
| Compose fails fast with `Set NEXT_PUBLIC_APP_BASE_URL for production` | Repo-root `.env` missing or incomplete (see 1.3). |

---

## 8. Security rules

- Never commit `backend/.env`, `backend/db.env`, `frontend/.env.local`, or the
  repo-root `.env`. Never paste their values into chats, issues, or logs.
- Secrets live only in those env files; `NEXT_PUBLIC_*` must never hold a
  secret (they ship to every browser).
- The cloudflared token grants tunnel control — keep it out of the repo and
  rotate it if it ever appears anywhere untrusted.
- Frontend (3000) and backend (8000) bind `127.0.0.1` only; PostgreSQL and
  Redis publish no host ports. Keep it that way — the tunnel is the only
  ingress.
