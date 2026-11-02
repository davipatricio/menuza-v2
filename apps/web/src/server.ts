import "./sentry.server.ts";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { proxyUpstream } from "./server/proxy-upstream";
import { resolveHost } from "./server/tenant-resolve";

const handler = createStartHandler(defaultStreamHandler);

export default createServerEntry({
  async fetch(request, opts) {
    const result = await resolveHost(request);

    if ("pass" in result) return handler(request, opts);

    if ("deny" in result) {
      const body = result.deny === "unknown-host" ? "Host desconhecido." : "Não encontrado.";

      return new Response(body, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Mutate the incoming headers in place. Constructing a new Request from an
    // incoming one fails in Vite dev (the Request comes from a different undici
    // realm), and the Start handler reads this same request instance downstream.
    // Before the proxy, so a forged tenant header never reaches an upstream.
    request.headers.delete("x-menuza-tenant-id");
    request.headers.set("x-menuza-mode", result.mode);
    request.headers.set("x-menuza-host", result.host);

    if (result.tenantId !== null) request.headers.set("x-menuza-tenant-id", result.tenantId);

    // The same-origin API mounts the Next rewrites served (S14). `null` for
    // every other path, so the app keeps handling those normally.
    const upstream = await proxyUpstream(request, result);

    if (upstream) return upstream;

    return handler(request, opts);
  },
});
