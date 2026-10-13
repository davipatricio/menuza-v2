/**
 * Dashboard design guardrail.
 *
 * Catches the AI mistakes DESIGN.md bans: raw Tailwind colors, space-x/y,
 * gradients, custom loading placeholders, raw dividers, overlay a11y gaps, and
 * Button API misuse. Runs on Bun with zero dependencies.
 *
 * Usage: bun run scripts/design-check.ts [--json] [paths...]
 * Default scope is the dashboard (apps/web/src/app/(dashboard)): DESIGN.md is
 * dashboard-scoped, and src/components/ui/ is upstream shadcn (managed via
 * `shadcn add --diff`, not hand-edited) so it is always skipped.
 * Pass explicit paths to check marketing/storefront/shared components.
 * Exits 1 on errors, 0 on warnings only.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const args = process.argv.slice(2);

const asJson = args.includes("--json");

const roots = args.filter((a) => !a.startsWith("--"));

const SCOPES = (roots.length > 0 ? roots : ["apps/web/src/app/(dashboard)"]).map((r) =>
  resolve(ROOT, r),
);

// Upstream shadcn primitives — managed via `shadcn add --diff`, never hand-fixed
// to satisfy this script. Consumer rules below target app code, not these files.
const SKIP_SEGMENTS = ["components/ui"];

interface Finding {
  file: string;
  line: number;
  rule: string;
  message: string;
  severity: "error" | "warn";
}

const findings: Finding[] = [];

// Files that ARE the primitive — never flag their own implementation.
const PRIMITIVE_FILES = new Set([
  "skeleton.tsx",
  "separator.tsx",
  "badge.tsx",
  "button.tsx",
  "empty-state.tsx", // grandfathered custom empty state, see DESIGN.md gaps
]);

function rel(path: string): string {
  const norm = path.replace(/\\/g, "/");

  return norm.replace(`${ROOT.replace(/\\/g, "/")}/`, "");
}

function report(
  file: string,
  line: number,
  rule: string,
  message: string,
  severity: "error" | "warn",
): void {
  findings.push({ file: rel(file), line, rule, message, severity });
}

const RAW_STATUS =
  /\b(?:bg|text|border)-(?:blue|red|green|emerald|amber|yellow|orange|purple|pink|lime|cyan|sky|indigo|violet|fuchsia|rose|neutral|gray|slate|zinc|stone)-\d{2,3}\b/;

const DARK_RAW = /\bdark:(?:bg|text|border)-(?:white|black|gray|neutral|slate|zinc|stone)-\S*/;

const SPACE_XY = /\bspace-[xy]-\S+/;

const TRUNCATE_LONGHAND =
  /overflow-hidden.*text-ellipsis.*whitespace-nowrap|whitespace-nowrap.*text-ellipsis.*overflow-hidden/;

const GRADIENT = /bg-gradient-to-|bg-linear-to-|bg-clip-text/;

const PULSE = /animate-pulse/;

const MANUAL_Z = /z-50|z-\[999\]/;

const BUTTON_LOADING = /<Button[^>]*\b(isPending|isLoading)\s*=/;

const HR_TAG = /<hr[\s>]/;

const WH_PAIR = /\bw-(\d+)\s[^"']*\bh-\1\b|\bh-(\d+)\s[^"']*\bw-\2\b/;

function checkFile(path: string): void {
  if (path.replace(/\\/g, "/").includes(SKIP_SEGMENTS[0])) return;

  if (!/\.(tsx|ts|css)$/.test(path)) return;
  const base = path.split(/[/\\]/).pop() ?? "";
  let body: string;

  try {
    body = readFileSync(path, "utf8");
  } catch {
    return;
  }

  const lines = body.split("\n");
  const isPrimitive = PRIMITIVE_FILES.has(base);
  const isTsx = path.endsWith(".tsx");

  lines.forEach((text, i) => {
    const line = i + 1;

    if (RAW_STATUS.test(text))
      report(
        path,
        line,
        "no-raw-status-colors",
        "Raw Tailwind status color — use Badge variants or semantic tokens.",
        "error",
      );

    if (DARK_RAW.test(text))
      report(
        path,
        line,
        "no-dark-raw-override",
        "Manual dark: color override — semantic tokens already switch.",
        "error",
      );

    if (SPACE_XY.test(text))
      report(path, line, "no-space-xy", "space-x/y-* — use flex with gap-*.", "error");

    if (GRADIENT.test(text))
      report(
        path,
        line,
        "no-gradients",
        "Gradient/shimmer sweep — dashboard bans gradients; use Skeleton.",
        "error",
      );

    if (HR_TAG.test(text)) report(path, line, "use-separator", "<hr> — use Separator.", "error");

    if (isTsx && BUTTON_LOADING.test(text))
      report(
        path,
        line,
        "no-button-loading-prop",
        "Button has no isPending/isLoading — compose Spinner + disabled.",
        "error",
      );

    if (isTsx && MANUAL_Z.test(text))
      report(
        path,
        line,
        "no-manual-z",
        "Manual z-50/999 — overlays handle their own stacking.",
        "error",
      );

    if (isTsx && !isPrimitive && PULSE.test(text))
      report(path, line, "use-skeleton", "animate-pulse placeholder — use Skeleton.", "error");

    if (TRUNCATE_LONGHAND.test(text))
      report(path, line, "use-truncate", "Overflow longhand — use truncate.", "error");

    if (isTsx && WH_PAIR.test(text))
      report(path, line, "use-size", "w-N + h-N pair — use size-N.", "warn");
  });

  if (!isTsx || isPrimitive) return;

  // File-level a11y composition checks.
  if (/<Avatar[\s>]/.test(body) && !body.includes("AvatarFallback"))
    report(path, 1, "avatar-fallback", "Avatar without AvatarFallback.", "error");

  for (const [tag, title] of [
    ["<Dialog", "DialogTitle"],
    ["<Sheet", "SheetTitle"],
    ["<Drawer", "DrawerTitle"],
  ] as const) {
    if (body.includes(tag) && !body.includes(title))
      report(path, 1, "overlay-title", `${tag.slice(1)} without ${title} (sr-only ok).`, "error");
  }
}

function walk(dir: string): void {
  if (!existsSync(dir)) return;
  const s = statSync(dir);

  if (s.isFile()) {
    checkFile(dir);

    return;
  }

  const normalized = dir.replace(/\\/g, "/");

  if (SKIP_SEGMENTS.some((s) => normalized.includes(s))) return;

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);

    if (st.isDirectory()) walk(full);
    else if (st.isFile()) checkFile(full);
  }
}

for (const scope of SCOPES) walk(scope);

const errors = findings.filter((f) => f.severity === "error");

const warns = findings.filter((f) => f.severity === "warn");

if (asJson) {
  console.log(JSON.stringify({ errors, warns }, null, 2));
} else if (findings.length === 0) {
  console.log("[✓] design-check: clean");
} else {
  for (const f of [...errors, ...warns])
    console.log(
      `[${f.severity === "error" ? "✗" : "!"}] ${f.file}:${f.line} ${f.rule} — ${f.message}`,
    );
  console.log(
    `[${errors.length > 0 ? "✗" : "✓"}] design-check: ${errors.length} error(s), ${warns.length} warning(s) across ${SCOPES.map(rel).join(", ")}`,
  );
}

process.exit(errors.length > 0 ? 1 : 0);
