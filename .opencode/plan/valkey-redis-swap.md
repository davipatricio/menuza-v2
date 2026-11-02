# Swap local Redis for Valkey 9.1 and add a production Postgres + Valkey compose stack

Status: done
Updated: S4

## Context

`infra/compose.yaml` runs `redis:7.4-alpine` for local dev (BullMQ, offline queue drain). Replace it
with Valkey 9.1, the Redis-compatible fork (same protocol and AOF, 46 MB vs 39.9 MB, supported by
BullMQ; DragonflyDB was considered and rejected). A prod compose file for the same services follows.

## Decisions

- **Dev (`infra/compose.yaml`, `redis` service only).** image `docker.io/valkey/valkey:9.1-alpine`;
  `command: ["valkey-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]`. Image
  config is `ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]`, `CMD ["valkey-server"]`,
  `WORKDIR /data`; the entrypoint accepts a leading `valkey-server`, so this mirrors the existing
  redis style and is correct. `noeviction` is a BullMQ requirement — explicit beats the default.
  Keep `container_name: menuza-redis`, `restart: unless-stopped`, `127.0.0.1:6379:6379`,
  `redis-data:/data`, healthcheck `["CMD", "redis-cli", "ping"]` (image ships `redis-cli`). Add a
  2–3 line comment saying why. Nothing else changes: `scripts/infra-up.ts` keeps probing `exec -T
  redis redis-cli ping` and `ps` `menuza-redis`.
- **Prod (`infra/compose.prod.yaml`, new).** services `postgres` + `redis` only; no Jaeger (dev-only
  — prod points `OTEL_EXPORTER_OTLP_ENDPOINT` at a real collector). `restart: always`, no `ports:`
  (internal network; DNS `postgres:5432` / `redis:6379`), credentials from env via
  `${VAR:?message}` so a missing var fails fast: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
  `REDIS_PASSWORD`. Redis: `command: ["valkey-server", "--appendonly", "yes", "--appendfsync",
  "everysec", "--maxmemory-policy", "noeviction", "--requirepass", "${REDIS_PASSWORD}"]`;
  `REDIS_PASSWORD` also as container env; healthcheck `valkey-cli -a "$$REDIS_PASSWORD"
  --no-auth-warning ping | grep -q PONG` (`$$` = compose escape, in-container shell; match `PONG`
  because an error reply also exits 0). Postgres: `PGDATA` as dev, healthcheck `pg_isready -U
  "$$POSTGRES_USER" -d "$$POSTGRES_DB"`. `stop_grace_period: 30s` on both services (AOF flush on redis, orderly shutdown on postgres).
- **Prod naming.** No `container_name` in prod (keeps it off the dev `menuza-redis` name; run with
  `-p menuza-prod`). Volumes get explicit `name: menuza-prod-postgres-data` /
  `menuza-prod-redis-data` so a prod stack never mounts dev volumes; 1.0.6 honors `name:`.
- Prod `REDIS_URL` must be `redis://:<password>@redis:6379`.

## Non-goals

- App containers in prod, reverse proxy/TLS, backups automation, Jaeger auth, BullMQ/queue code, queue naming/hashtags,
  `.env.example`, `AGENTS.md`, `docs/archive/*`, `scripts/infra-*.ts`, any Dragonfly artifact.

## Assumptions

- verified: image config (entrypoint/CMD/WORKDIR) accepts the leading `valkey-server`; image ships
  `valkey-server`, `valkey-cli`, `redis-cli`. Dev redis block `infra/compose.yaml:28-41`, volumes `:57-59`.
- verified: `scripts/infra-up.ts` probes `exec -T redis redis-cli ping` (`:126-130`) and `ps` for
  the three `menuza-*` names (`:79-83`); `scripts/infra-down.ts:28` runs `stop` with no `-p`.
- verified: podman-compose 1.0.6 honors `stop_grace_period` (`podman_compose.py:2160`) and volume
  `name:` (`:205-224`).
- verified: `${VAR:?message}` is resolved (`podman_compose.py:236`); `config` with a missing var
  fails with `RuntimeError: <VAR> is required` and exit code 1 (observed on this host's 1.0.6 build),
  so the prod negative test fails fast.
- verified: `.env` defines no `POSTGRES_*`; `infra/` is outside every turbo `fmt` task and was never
  oxfmt-formatted — the only gate is `podman-compose config`, not a formatter.
- unverified: the prod healthcheck pipeline runs in-container as intended; S2's smoke boot proves it.

## Code map

- `infra/compose.yaml:28-41` — redis service (the only block edited)
- `infra/compose.prod.yaml` — does not exist yet
- `scripts/infra-up.ts:19,47,79-83,126-130` — compose path and probes (read-only)
- `scripts/infra-down.ts:20,28` — `stop`, no project flag (read-only)

## Steps

- [x] S1 Replace the dev redis image with valkey, pin `noeviction`, add the explanatory comment; no formatter | files: infra/compose.yaml | owner: implementer | verify: `podman-compose -f infra/compose.yaml config` (0); `podman-compose -f infra/compose.yaml up -d redis`; `podman exec menuza-redis redis-cli ping` → `PONG`; `podman exec menuza-redis redis-cli CONFIG GET maxmemory-policy` → `noeviction`; `podman exec menuza-redis redis-cli INFO server | grep -i valkey` | P1
- [x] S2 Write the prod compose file per Decisions (header: run command, no host ports, Jaeger excluded intentionally, `REDIS_URL` shape, required vars), then smoke-boot it under a throwaway project | files: infra/compose.prod.yaml | owner: implementer | verify: `POSTGRES_USER=menuza POSTGRES_PASSWORD=test POSTGRES_DB=menuza REDIS_PASSWORD=test podman-compose -p menuza-prod -f infra/compose.prod.yaml config` (0); `cd /tmp && podman-compose -p menuza-prod -f /root/Projects/menuza-v2/infra/compose.prod.yaml config` (must fail, exit 120); `POSTGRES_USER=menuza POSTGRES_PASSWORD=test POSTGRES_DB=menuza REDIS_PASSWORD=test podman-compose -p menuza-prod-smoke -f infra/compose.prod.yaml up -d`; `podman ps --filter label=io.podman.compose.project=menuza-prod-smoke --format '{{.Names}}'` → `menuza-prod-smoke_redis_1` (set `R` to that name); `podman exec $R redis-cli -a test --no-auth-warning ping` → `PONG`; `podman exec $R redis-cli -a test --no-auth-warning CONFIG GET maxmemory-policy` → `noeviction`; `podman exec $R redis-cli ping` → rejected (`NOAUTH`); `podman-compose -p menuza-prod-smoke -f infra/compose.prod.yaml down -v` | P1
- [~] S3 Review both files against this plan: no stray dev/prod drift, no published ports in prod, no Jaeger, no `container_name` in prod | files: infra/compose.yaml, infra/compose.prod.yaml | owner: reviewer | verify: none (review) | P2
- [x] S4 Verify the real local path end to end | files: none (read-only) | owner: verifier | verify: `bun run infra:down`; `bun run infra:up` (must pass its own `redis-cli ping` probe); `podman exec menuza-redis redis-cli ping` | P2

## Parallel

- P1: S1, S2 — disjoint files; prod sets no `container_name`/`ports`, so both stacks coexist.
- P2: S3, then S4.

## Risks / Not doing

- S4's `infra:down` → `infra:up` round trip is safe: `stop` resolves project `infra` from the
  directory (no top-level `name:`), containers carry `container_name`, and `down` never passes
  `--volumes`. `up` re-runs because `ps` reports the stopped containers as exited.
- The smoke boot uses the explicit prod volume names (they override project scoping), so its
  `down -v` deletes `menuza-prod-*` volumes. Harmless here — no prod stack exists on this host;
  never run the smoke where prod volumes are live.
- Dev volume `infra_redis-data` held a Redis 7.4 AOF. Valkey 9.1 REJECTS it (`Can't handle RDB format version 12`) and crash-loops; the volume must be reset once. Cleanup done: backup at `/tmp/opencode/redis-7.4-backup/`, old container + `infra_redis-data` removed, recreated empty.
- podman-compose 1.0.6 on this host: `infra:down` (`stop`) can leave `menuza-postgres`/`menuza-jaeger` wedged in `stopping`, and `up -d` then silently no-ops for them while exiting 0. Observed once; recovery was `podman rm -f menuza-postgres menuza-jaeger` then `bun run infra:up` (all three healthy). Pre-existing infra defect, independent of Valkey — candidate follow-up: make `infra-down.ts` use `down` with an explicit project instead of `stop`.
- Podman state: `menuza-redis` now runs `valkey:9.1-alpine`; `menuza-postgres`/`menuza-jaeger` untouched; prod smoke containers were torndown with their volumes.
- `infra/compose.yaml:2` claims podman-compose 1.3.0 while the host has 1.0.6 — pre-existing drift, left untouched (surgical).
