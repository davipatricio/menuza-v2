import "./sentry.server.ts";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { proxyUpstream } from "./server/proxy-upstream";
import { resolveHost } from "./server/tenant-resolve";

interface PeerCarrier {
  runtime?: {
    node?: { req?: { socket?: { remoteAddress?: string } } };
    bun?: { server?: { requestIP?: (req: Request) => { address: string } | null } };
  };
}

interface BunPeerResolver {
  requestIP?: (req: Request) => { address: string } | null;
}

function socketPeerIp(request: Request, server?: BunPeerResolver): string | null {
  // SAFETY: srvx attaches optional `runtime.node` / `runtime.bun` metadata onto Request in dev/preview.
  const runtime = (request as Request & PeerCarrier).runtime;
  const nodePeer = runtime?.node?.req?.socket?.remoteAddress;

  if (nodePeer) return nodePeer;

  const bunServer = server ?? runtime?.bun?.server;

  return bunServer?.requestIP?.(request)?.address ?? null;
}

const handler = createStartHandler(defaultStreamHandler);

export default createServerEntry({
  async fetch(request, opts) {
    // Strip internal headers upfront on every path (including `pass` routes) so
    // a client-supplied header never reaches Start or any upstream service.
    request.headers.delete("x-menuza-tenant-id");
    request.headers.delete("x-menuza-mode");
    request.headers.delete("x-menuza-host");
    request.headers.delete("x-menuza-internal-token");

    // SAFETY: when served directly by Bun (`bun dist/server/server.js`), the second fetch argument is `Bun.Server`.
    const peerIp = socketPeerIp(request, opts as BunPeerResolver | undefined);
    const result = await resolveHost(request, peerIp);

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
