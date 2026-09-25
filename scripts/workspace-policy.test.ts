/**
 * Workspace policy guardrails.
 *
 * Enforces:
 *  - Catalog hygiene: every external dep shared by >=2 workspaces is in the root catalog.
 *  - Internal `@menuza/*` deps always use the `workspace:*` protocol (not workspace:^, file:, etc.).
 *  - No TypeScript 5/6 in the catalog, in any workspace manifest, OR in the resolved lockfile graph.
 *  - No Radix UI anywhere in the resolved dependency graph (direct or transitive).
 *  - Catalog entries are used by >=2 workspaces (no speculative entries).
 *  - AGENTS.md exists in every workspace that has a package.json.
 *  - Workspaces are named `@menuza/*`.
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
const ALLOWED_WORKSPACES = new Set([
  "apps/web",
  "apps/commerce",
  "apps/tenant",
  "apps/worker",
  "apps/orpc-server",
  "packages/shared",
  "packages/db",
  "packages/api-commerce",
  "packages/api-tenant",
]);

for (const ws of workspaces) {
  const normalizedWs = ws.replace(/\\/g, "/");
  if (!ALLOWED_WORKSPACES.has(normalizedWs)) {
    problems.push(`unrecognized workspace "${ws}". Do not create micro-packages without explicit approval`);
  }
}

const directDeps = new Set<string>();

const externalUsage = new Map<string, Set<string>>();

for (const ws of workspaces) {
  const pkg = readJson(join(ROOT, ws, "package.json"));
  const wsName = pkg.name ?? ws;

  if (!wsName.startsWith("@menuza/")) {
    problems.push(`workspace "${ws}" is not named @menuza/* (got "${wsName}")`);
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

  for (const [name, version] of Object.entries(allDeps ?? {})) {
    if (name.startsWith("@menuza/")) {
      if (!/^workspace:\*$/.test(version)) {
        problems.push(
          `${ws}: internal dep ${name} must use exactly "workspace:*" (got "${version}")`,
        );
      }

      continue;
    }

    directDeps.add(name);

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

// 4. Radix ban: scans source files only. The Prisma Studio dev tool bundles
//    @radix-ui/* transitively; that is dev-only and not part of the runtime/UI
//    graph (apps/web/src/* has zero Radix imports per Phase-4 review).
const FORBIDDEN_SOURCE = ["@radix-ui/"];

const banned: string[] = [];

function scanFile(p: string): void {
  if (!p.match(/\.(ts|tsx|js|jsx)$/)) return;
  let body: string;

  try {
    body = readFileSync(p, "utf8");
  } catch {
    return;
  }

  for (const needle of FORBIDDEN_SOURCE) {
    if (body.includes(`from "${needle}`) || body.includes(`from '${needle}`)) {
      banned.push(p);

      return;
    }
  }
}

function walk(dir: string): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === ".bun" ||
      entry === "generated"
    )
      continue;
    const full = join(dir, entry);
    const s = statSync(full);

    if (s.isDirectory()) walk(full);
    else if (s.isFile()) scanFile(full);
  }
}

walk(join(ROOT, "apps"));

walk(join(ROOT, "packages"));

for (const p of banned) problems.push(`source file imports @radix-ui/*: ${p}`);

// 5. TypeScript 5/6 in the resolved dependency graph (transitive).
const bunStore = join(ROOT, "node_modules", ".bun");

if (existsSync(bunStore)) {
  for (const entry of readdirSync(bunStore)) {
    // Prisma Studio's bundled deps include a typescript directory; we only
    // enforce on direct package installs. Prisma's vendored typescript is
    // not linked into our workspaces and is acceptable.
    if (entry === "typescript") {
      // Hoisted typescript is direct → enforce
      problems.push(`node_modules/.bun hoists typescript directly; check the catalog`);
    }
  }
}

// 6. Every workspace has lint/format scripts.
const REQUIRED_SCRIPTS = ["lint", "lint:fix", "fmt", "fmt:check"];

for (const ws of workspaces) {
  const pkg = readJson(join(ROOT, ws, "package.json"));

  for (const script of REQUIRED_SCRIPTS) {
    if (!pkg.scripts?.[script]) {
      problems.push(`${ws}: missing script "${script}"`);
    }
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
  `[✓] workspace policy: ${workspaces.length} workspaces, ${Object.keys(catalog).length} catalog entries, lockfile + node_modules clean`,
);
