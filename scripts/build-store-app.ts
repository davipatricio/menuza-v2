#!/usr/bin/env bun
/**
 * Builds or updates the storefront app of one published store.
 *
 * A published storefront binary carries its tenant in its Android package:
 * `app.menuza.store.<slug>`. The JS bundle carries nothing per-store — the app
 * reads its own `applicationId` at runtime — so the slug here only selects the
 * native identity from `apps/mobile-storefront/stores.json`.
 *
 * Usage:
 *   bun run store:build demo --platform android
 *   bun run store:build demo --platform ios
 *   bun run store:update demo --message "Cardápio de novembro"
 *
 * A slug with a hyphen is refused: Android package segments allow letters,
 * digits and underscores only, and the tenant slug doubles as the package tail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface StoreEntry {
  name: string;
  package: string;
  iosBundleId: string;
}

const args = process.argv.slice(2);

const update = args.includes("--update");

/** The first argument that is not a flag or a flag's value. */
function positional(): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (arg === "--platform" || arg === "--message") {
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) continue;

    return arg;
  }

  return undefined;
}

const slug = positional();

function flag(name: string): string | undefined {
  const index = args.indexOf(name);

  return index === -1 ? undefined : args[index + 1];
}

function fail(message: string): never {
  console.error(`[store-app] ${message}`);

  process.exit(1);
}

if (!slug) fail("usage: build-store-app.ts <storeSlug> [--update] [--platform android|ios|all]");

// The slug becomes the last segment of `app.menuza.store.<slug>`.
if (!/^[a-z0-9]{3,24}$/.test(slug)) {
  fail(`"${slug}" cannot be a package segment; use 3–24 lowercase letters and digits`);
}

const appDir = join(import.meta.dir, "..", "apps", "mobile-storefront");

// SAFETY: `stores.json` is the build matrix this script validates; a malformed
// entry fails the checks below instead of reaching EAS.
const stores = JSON.parse(readFileSync(join(appDir, "stores.json"), "utf8")) as Record<
  string,
  StoreEntry
>;

const store = stores[slug];

if (!store) fail(`"${slug}" has no entry in apps/mobile-storefront/stores.json`);

const expected = `app.menuza.store.${slug}`;

if (store.package !== expected) {
  fail(`stores.json declares "${store.package}", but a published store is "${expected}"`);
}

const platform = flag("--platform") ?? "android";

if (!["android", "ios", "all"].includes(platform)) {
  fail(`unknown platform "${platform}"; use android, ios or all`);
}

if (!update && platform === "all") fail("an EAS build targets one platform; choose android or ios");

const command = update
  ? [
      "eas-cli",
      "update",
      "--channel",
      "storefront",
      "--platform",
      platform,
      "--message",
      flag("--message") ?? `storefront ${new Date().toISOString()}`,
      "--non-interactive",
    ]
  : ["eas-cli", "build", "--platform", platform, "--profile", "production", "--non-interactive"];

console.log(
  update
    ? "[store-app] publishing the OTA bundle shared by every storefront build"
    : `[store-app] building ${store.name} as ${store.package}`,
);

const child = Bun.spawn(["bunx", ...command], {
  cwd: appDir,
  env: { ...process.env, STORE_SLUG: slug },
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(await child.exited);
