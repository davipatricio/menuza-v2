#!/usr/bin/env bun
/**
 * Bring up Postgres + Redis + Jaeger via Podman Compose.
 *
 * Native Linux/macOS: calls `podman-compose` directly.
 * Windows: runs via `wsl -e bash` in the Debian/Ubuntu WSL2 distro that has
 *   `podman-compose` installed. Uses Bun.spawnSync with an argv array so no
 *   shell quoting crosses the Win32 -> WSL boundary.
 *
 * The script blocks until both services answer their healthchecks, then exits 0.
 * If both are already running, exits 0 without touching them.
 */

const winRoot = process.cwd();

const isWindows = process.platform === "win32";

const composeRel = "infra/compose.yaml";

interface RunResult {
  code: number;
  out: string;
}

function runWsl(script: string): RunResult {
  const proc = Bun.spawnSync(["wsl", "-e", "bash", "-lc", script]);

  return {
    code: proc.exitCode ?? 1,
    out: `${proc.stdout?.toString() ?? ""}${proc.stderr?.toString() ?? ""}`,
  };
}

function wslPath(winPath: string): string {
  // wslpath wants forward slashes; backslashes become literal dirs otherwise.
  const winPosix = winPath.replaceAll("\\", "/");
  const proc = Bun.spawnSync(["wsl", "wslpath", "-a", winPosix]);

  if ((proc.exitCode ?? 1) !== 0) throw new Error(`wslpath failed: ${proc.stderr?.toString()}`);

  return proc.stdout.toString().trim();
}

function compose(args: string): RunResult {
  if (!isWindows) {
    const proc = Bun.spawnSync(["podman-compose", "-f", composeRel, ...args.split(" ")], {
      cwd: winRoot,
    });

    return {
      code: proc.exitCode ?? 1,
      out: `${proc.stdout?.toString() ?? ""}${proc.stderr?.toString() ?? ""}`,
    };
  }

  const wslRoot = cachedWslRoot();
  const composeFile = `${wslRoot}/${composeRel}`;

  return runWsl(
    `cd '${wslRoot}' && podman-compose -f '${composeFile}' ${args}`.replaceAll("\\", "/"),
  );
}

let cachedWslRootValue: string | null = null;

function cachedWslRoot(): string {
  if (cachedWslRootValue !== null) return cachedWslRootValue;

  cachedWslRootValue = wslPath(winRoot);

  return cachedWslRootValue;
}

const ps = compose("ps");
const psOut = ps.code === 0 ? ps.out : "";

const alreadyUp =
  psOut.includes("menuza-postgres") &&
  psOut.includes("menuza-redis") &&
  psOut.includes("menuza-jaeger") &&
  !/exit|dead/i.test(psOut);

if (!alreadyUp) {
  const up = compose("up -d");

  if (up.code !== 0) {
    console.error(`[infra] compose up failed:\n${up.out}`);
    process.exit(1);
  }

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
  const r = compose("exec -T postgres pg_isready -U menuza -d menuza");

  return r.out.toLowerCase().includes("accepting connections");
}

async function redisReady(): Promise<boolean> {
  const r = compose("exec -T redis redis-cli ping");

  return /^pong$/im.test(r.out.trim());
}

const ok = (await waitFor("postgres", postgresReady)) && (await waitFor("redis", redisReady));

if (!ok) process.exit(1);
