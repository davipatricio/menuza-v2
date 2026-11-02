import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectManifest } from "@serwist/build";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";

// The repo-root `.env` is the only env file (there is no per-app one), and the
// server runtime reads env at module load, so it has to reach `process.env`
// before any `src/server/**` module is imported. Vite only exposes VITE_* keys
// to the browser, so this stays server-side.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

for (const [key, value] of Object.entries(
  loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", repoRoot, ""),
)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const commerceInternal = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

const tenantInternal = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

// Dev-only mirror of the rewrites in apps/web/next.config.ts:37-55; production
// serves them from the server proxy instead (S14). Keys are anchored RegExp
// (Vite treats a leading `^` as one), so only the real mounts match and
// `/mcpfoo` still reaches the app. `req.url` carries the query string, hence
// the `[/?]` alternatives. /commerce, /tenant and /webhooks strip their mount
// prefix upstream; the OAuth, discovery and MCP mounts keep it.
// `xfwd` sends `x-forwarded-host`/`-proto`/`-for`, which is what
// `src/server/proxy-upstream.ts` sets in production; the APIs build absolute
// URLs from the forwarded host either way.
/**
 * Bundles `src/sw.ts` into `dist/client/serwist/sw.js` — the path
 * `src/lib/push-subscription.ts` registers — and injects the precache manifest
 * there.
 *
 * Why not `@serwist/vite`: it resolves its options from the last config
 * `vite build` hands it, and Start resolves the SSR config (outDir
 * `dist/server`, `build.ssr: true`) before the client build finishes, so its
 * `closeBundle` guard skips generation. This plugin does the same two steps —
 * a lib-mode bundle of the worker, then `injectManifest` — scoped to the client
 * environment.
 */
function serwistWorker(): Plugin {
  let root = process.cwd();

  return {
    name: "menuza:serwist-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      if (this.environment?.name !== "client") return;

      const { build } = await import("vite");
      const clientDir = path.resolve(root, "dist/client");
      const bundleDir = path.resolve(root, ".serwist");

      await build({
        configFile: false,
        root,
        publicDir: false,
        logLevel: "warn",
        build: {
          outDir: bundleDir,
          emptyOutDir: true,
          minify: true,
          lib: {
            entry: path.resolve(root, "src/sw.ts"),
            name: "menuzaServiceWorker",
            formats: ["iife"],
            fileName: () => "sw.js",
          },
          rollupOptions: { output: { entryFileNames: "sw.js" } },
        },
      });

      const result = await injectManifest({
        swSrc: path.resolve(bundleDir, "sw.js"),
        swDest: path.resolve(clientDir, "serwist/sw.js"),
        globDirectory: clientDir,
        globPatterns: ["**/*.{js,css,html,webmanifest,svg,png,ico,woff2}"],
        globIgnores: ["serwist/sw.js"],
        injectionPoint: "self.__SW_MANIFEST",
      });

      console.info(`[serwist] ${result.count} precache entries injected.`);
    },
  };
}

export default defineConfig(({ command }) => ({
  // Dev stays plugin-free on purpose: a service worker installed by the dev
  // server would serve stale assets against a rebuild loop. `src/sw.ts` is
  // bundled only by `vite build`, straight to `dist/client/serwist/sw.js` —
  // the path `src/lib/push-subscription.ts` registers.
  plugins: [
    tanstackStart(),
    tailwindcss(),
    viteReact(),
    ...(command === "build" ? [serwistWorker()] : []),
  ],
  server: {
    port: 3003,
    host: "127.0.0.1",
    // Dev only: the host-routing middleware must be able to return its own 404 for unknown hosts instead of Vite's 403 host check.
    allowedHosts: true,
    proxy: {
      "^/commerce(?:[/?]|$)": {
        target: commerceInternal,
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/commerce/, ""),
      },
      "^/tenant(?:[/?]|$)": {
        target: tenantInternal,
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/tenant/, ""),
      },
      // Exactly these two paths, no subpaths (Next: `/oauth/token`, `/oauth/revoke`).
      "^/oauth/token(?:\\?|$)": { target: tenantInternal, changeOrigin: true, xfwd: true },
      "^/oauth/revoke(?:\\?|$)": { target: tenantInternal, changeOrigin: true, xfwd: true },
      "^/\\.well-known/oauth-authorization-server(?:\\?|$)": {
        target: tenantInternal,
        changeOrigin: true,
        xfwd: true,
      },
      // Next splits this into `/mcp` + `/mcp/:path*`; one anchored key covers both.
      "^/mcp(?:[/?]|$)": { target: tenantInternal, changeOrigin: true, xfwd: true },
      // Next: `/webhooks/:path*` — the bare mount is not a route.
      "^/webhooks/.+": {
        target: commerceInternal,
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/webhooks/, ""),
      },
    },
  },
  resolve: { tsconfigPaths: true },
}));
