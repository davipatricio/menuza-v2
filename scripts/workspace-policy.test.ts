/**
 * Workspace policy guardrails.
 *
 * Enforces:
 *  - Catalog hygiene: every external dep shared by >=2 workspaces is in the root catalog.
 *  - Internal `@menuza/*` deps always use the `workspace:*` protocol (not workspace:^, file:, etc.).
 *  - No TypeScript 5/6 in the catalog or in any workspace manifest.
 *  - Catalog entries are used by >=2 workspaces (no speculative entries).
 *  - AGENTS.md exists in every workspace that has a package.json.
 *  - AGENTS.md exists in every crate under `crates/`.
 *  - Workspaces are named `@menuza/*`.
 *  - No workspace references a deleted Bun API workspace.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

type DepMap = Record<string, string>;

interface PackageJson {
  name?: string;
  dependencies?: DepMap;
  devDependencies?: DepMap;
  peerDependencies?: DepMap;
  workspaces?: { packages?: string[]; catalog?: DepMap };
}

const readJson = (p: string) => {
  const raw = readFileSync(p, "utf8");
  // SAFETY: every manifest on disk is a JSON object (JSON.parse of an object
  // literal per the npm manifest spec). A non-object manifest fails the field
  // reads below loudly, which is the desired behavior for policy checks.
  const manifest = JSON.parse(raw) as PackageJson;

  return {
    name: manifest.name,
    scripts: manifest.scripts,
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    peerDependencies: manifest.peerDependencies,
    workspaces: manifest.workspaces,
  } satisfies PackageJson;
};

const root = readJson(join(ROOT, "package.json"));

const catalog = root.workspaces?.catalog ?? {};

const discover = (rel: string): string[] => {
  const abs = join(ROOT, rel);

  if (!existsSync(abs)) return [];

  return readdirSync(abs)
    .filter((n) => statSync(join(abs, n)).isDirectory())
    .map((n) => join(rel, n));
};

const workspaces = [
  ...discover("apps").filter((p) => existsSync(join(ROOT, p, "package.json"))),
  ...discover("packages").filter((p) => existsSync(join(ROOT, p, "package.json"))),
];

const problems: string[] = [];

// Explicit canonical workspace allowlist: blocks accidental or speculative packages
const ALLOWED_WORKSPACES = new Set(["apps/web", "packages/shared", "packages/db"]);

// The Bun API runtime was replaced by the Rust crates; nothing may depend on it.
const DELETED_WORKSPACES = new Set([
  "@menuza/commerce",
  "@menuza/tenant",
  "@menuza/worker",
  "@menuza/orpc-server",
  "@menuza/api-commerce",
  "@menuza/api-tenant",
  "@menuza/pagarme-api-client",
]);

for (const ws of workspaces) {
  const normalizedWs = ws.replace(/\\/g, "/");

  if (!ALLOWED_WORKSPACES.has(normalizedWs)) {
    problems.push(
      `unrecognized workspace "${ws}". Do not create micro-packages without explicit approval`,
    );
  }
}

const externalUsage = new Map<string, Set<string>>();

for (const ws of workspaces) {
  const pkg = readJson(join(ROOT, ws, "package.json"));
  const wsName = pkg.name ?? ws;

  if (!wsName.startsWith("@menuza/")) {
    problems.push(`workspace "${ws}" is not named @menuza/* (got "${wsName}")`);
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

  for (const [name, version] of Object.entries(allDeps ?? {})) {
    if (DELETED_WORKSPACES.has(name)) {
      problems.push(`${ws}: references deleted workspace ${name}`);
    }

    if (name.startsWith("@menuza/")) {
      if (!/^workspace:\*$/.test(version)) {
        problems.push(
          `${ws}: internal dep ${name} must use exactly "workspace:*" (got "${version}")`,
        );
      }

      continue;
    }

    if (name === "typescript") {
      const major = Number.parseInt(String(version).replace(/^[^\d]*/, ""), 10);

      if (!String(version).startsWith("catalog:") && major < 7) {
        problems.push(`${ws}: typescript must be >= 7 or "catalog:" (got "${version}")`);
      }
    }

    if (!externalUsage.has(name)) externalUsage.set(name, new Set());
    externalUsage.get(name)!.add(ws);
  }

  if (!existsSync(join(ROOT, ws, "AGENTS.md"))) {
    problems.push(`${ws}: missing AGENTS.md`);
  }
}

// 1. Every external dep shared by >=2 workspaces is in the catalog.
for (const [name, users] of externalUsage) {
  if (users.size >= 2 && !(name in catalog)) {
    problems.push(`${name} used by ${users.size} workspaces but missing from catalog`);
  }
}

// 2. No speculative catalog entries: every catalog entry is used by >=2 workspaces.
for (const name of Object.keys(catalog)) {
  const users = externalUsage.get(name)?.size ?? 0;

  if (users < 2) {
    problems.push(`catalog entry "${name}" is used by ${users} workspace(s); remove or inline it`);
  }
}

// 3. TypeScript version policy.
const tsVersion = catalog.typescript;

if (!tsVersion) {
  problems.push("catalog.typescript is missing");
} else {
  const major = Number.parseInt(String(tsVersion).replace(/^[^\d]*/, ""), 10);

  if (major < 7) {
    problems.push(`catalog.typescript must be >= 7 (got "${tsVersion}")`);
  }
}

// 4. Every crate carries its own AGENTS.md.
const crates = discover("crates").filter((p) => existsSync(join(ROOT, p, "Cargo.toml")));

for (const crate of crates) {
  if (!existsSync(join(ROOT, crate, "AGENTS.md"))) {
    problems.push(`${crate}: missing AGENTS.md`);
  }
}

// 5. Every workspace has lint/format scripts.
const REQUIRED_SCRIPTS = ["lint", "lint:fix", "fmt", "fmt:check"];

for (const ws of workspaces) {
  const pkg = readJson(join(ROOT, ws, "package.json"));

  for (const script of REQUIRED_SCRIPTS) {
    if (!pkg.scripts?.[script]) {
      problems.push(`${ws}: missing script "${script}"`);
    }
  }
}

// 6. The root scripts do not drive a deleted workspace.
for (const [name, cmd] of Object.entries(root.scripts ?? {})) {
  for (const deleted of DELETED_WORKSPACES) {
    if (cmd.includes(deleted)) problems.push(`root script "${name}" drives deleted ${deleted}`);
  }
}

const failed = problems.length > 0;

if (failed) {
  console.log(
    `[✗] workspace policy violated (${problems.length} problem${problems.length === 1 ? "" : "s"}):`,
  );

  for (const p of problems) console.log(`    - ${p}`);
  process.exit(1);
}

console.log(
  `[✓] workspace policy: ${workspaces.length} workspaces, ${crates.length} crates, ${Object.keys(catalog).length} catalog entries`,
);
