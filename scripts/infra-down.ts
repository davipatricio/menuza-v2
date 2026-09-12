#!/usr/bin/env bun
/**
 * Stop Postgres + Redis containers. Volumes are preserved (no --volumes).
 */
import { $ } from "bun";

const winRoot = process.cwd();

const wslRoot = await $`wsl wslpath -a "${winRoot}"`.text();

await $`wsl -e bash -lc "cd '${wslRoot.trim()}' && podman-compose -f infra/compose.yaml stop"`.quiet();

console.log("[infra] containers stopped (volumes preserved)");
