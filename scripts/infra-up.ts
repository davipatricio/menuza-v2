#!/usr/bin/env bun
/**
 * Bring up Postgres + Redis via Podman Compose.
 *
 * Native Linux/macOS: calls `podman-compose` directly.
 * Windows: shell-out via `wsl -e bash` to a Debian/Ubuntu WSL2 distro that has
 *   `podman-compose` 1.3.0+ installed.
 *
 * The script blocks until both services answer their healthchecks, then exits 0.
 * If both are already running, exits 0 without touching them.
 */
import { $ } from "bun";

const winRoot = process.cwd();

const isWindows = process.platform === "win32";

const composeRel = "infra/compose.yaml";

async function inWsl(cmd: string): Promise<string> {
  const wslRoot = await $`wsl wslpath -a "${winRoot}"`.text();

  return $`wsl -e bash -lc "cd '${wslRoot.trim()}' && ${cmd}"`.text();
}

const compose = (args: string) =>
  isWindows
    ? inWsl(`podman-compose -f ${composeRel} ${args}`)
    : $`podman-compose -f ${composeRel} ${args}`.text();

const ps = await compose("ps --status running").catch(() => "");

const alreadyUp =
  ps.split("\n").filter((l) => l.includes("menuza-postgres") || l.includes("menuza-redis"))
    .length >= 2;

if (!alreadyUp) {
  const upCmd = `podman-compose -f ${composeRel} up -d`;

  if (isWindows) await inWsl(upCmd);
  else await $`podman-compose -f ${composeRel} up -d`.quiet();
  console.log("[infra] containers started");
}

console.log("[infra] waiting for healthchecks…");

async function waitFor(
  label: string,
  probe: () => Promise<boolean>,
  timeoutMs = 60_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await probe()) {
      console.log(`[infra] ${label} healthy`);

      return true;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.error(`[infra] ${label} did not become healthy in ${timeoutMs}ms`);

  return false;
}

async function postgresReady(): Promise<boolean> {
  try {
    const out = await compose(`exec -T postgres pg_isready -U menuza -d menuza`).catch(() => "");

    return out.toLowerCase().includes("accepting connections");
  } catch {
    return false;
  }
}

async function redisReady(): Promise<boolean> {
  try {
    const out = await compose(`exec -T redis redis-cli ping`).catch(() => "");

    return /pongs/i.test(out);
  } catch {
    return false;
  }
}

const ok = (await waitFor("postgres", postgresReady)) && (await waitFor("redis", redisReady));

if (!ok) process.exit(1);
