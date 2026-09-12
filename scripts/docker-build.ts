#!/usr/bin/env bun
// Prune the monorepo for one app, then build its Containerfile from the
// pruned context. Usage: bun run scripts/docker-build.ts <app>
import { exit } from "node:process";

const app = process.argv[2];

if (!app || !/^[a-z-]+$/.test(app)) {
  console.error("usage: bun run scripts/docker-build.ts <app>");
  exit(1);
}

const winRoot = process.cwd();
const pruneDir = `.turbo/prune/${app}`;

// ponytail: wslPath duplicated from infra-up/infra-down; extract to scripts/lib when a third consumer appears.
function wslPath(p: string): string {
  return Bun.spawnSync(["wsl", "wslpath", "-a", p.replaceAll("\\", "/")])
    .stdout.toString()
    .trim();
}

const prune = Bun.spawnSync(
  ["bunx", "turbo", "prune", `@menuza/${app}`, "--docker", "--out-dir", pruneDir],
  { stdio: ["inherit", "inherit", "inherit"] },
);

if (prune.exitCode !== 0) exit(prune.exitCode ?? 1);

// turbo prune does not copy root tsconfig.base.json, but every workspace
// tsconfig extends it — needed by prisma generate (bun runtime) and next build.
const baseConfig = Bun.file("tsconfig.base.json");

if (await baseConfig.exists()) {
  await Bun.write(`${pruneDir}/full/tsconfig.base.json`, baseConfig);
}

const root = wslPath(winRoot);
const build = Bun.spawnSync(
  [
    "wsl",
    "-e",
    "bash",
    "-lc",
    `podman build -f '${root}/apps/${app}/Containerfile' -t menuza-${app} '${root}/${pruneDir}'`,
  ],
  { stdio: ["inherit", "inherit", "inherit"] },
);

exit(build.exitCode ?? 1);
