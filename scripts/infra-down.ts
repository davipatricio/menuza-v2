#!/usr/bin/env bun
/**
 * Stop Postgres + Redis containers. Volumes are preserved (no --volumes).
 */
const winRoot = process.cwd();

if (process.platform === "win32") {
  const winPosix = winRoot.replaceAll("\\", "/");
  const pathProc = Bun.spawnSync(["wsl", "wslpath", "-a", winPosix]);

  if ((pathProc.exitCode ?? 1) !== 0) throw new Error("wslpath failed");

  const wslRoot = pathProc.stdout.toString().trim();
  const stop = Bun.spawnSync([
    "wsl",
    "-e",
    "bash",
    "-lc",
    `cd '${wslRoot}' && podman-compose -f '${wslRoot}/infra/compose.yaml' stop`,
  ]);

  if ((stop.exitCode ?? 1) !== 0) {
    console.error(stop.stderr?.toString());
    process.exit(1);
  }
} else {
  const stop = Bun.spawnSync(["podman-compose", "-f", "infra/compose.yaml", "stop"], {
    cwd: winRoot,
  });

  if ((stop.exitCode ?? 1) !== 0) {
    console.error(stop.stderr?.toString());
    process.exit(1);
  }
}

console.log("[infra] containers stopped (volumes preserved)");
