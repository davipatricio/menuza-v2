/**
 * Tenant management API process. Bun.serve on loopback.
 * Imports the router from `@menuza/api-tenant` and owns the process lifecycle.
 * Deny-by-default: only the health probe and the push routes are exposed; see AGENTS.md.
 */
import {
  buildOpenApiFetch,
  buildRpcFetch,
  initOtel,
  initSentry,
  log,
  newRequestId,
  registerShutdown,
  shutdownOtel,
} from "@menuza/orpc-server";
import { disconnectDb, pingDb } from "@menuza/db";
import { tenantDomainRouter } from "@menuza/api-tenant";

initSentry({ service: "tenant" });

initOtel({ service: "tenant" });

const port = Number(process.env.TENANT_PORT ?? 3002);

// Loopback by default; Docker sets HOST=0.0.0.0 to publish the port.
const hostname = process.env.HOST ?? "127.0.0.1";

const rpcFetch = buildRpcFetch(tenantDomainRouter, { service: "tenant" });

// Same router, RESTful protocol, dedicated prefix. See apps/orpc-server/AGENTS.md.
const openApiFetch = buildOpenApiFetch(tenantDomainRouter, { service: "tenant" });

const server = Bun.serve({
  port,
  hostname,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/livez") return new Response("ok", { status: 200 });

    if (url.pathname === "/readyz") {
      try {
        await pingDb();

        return new Response("ok", { status: 200 });
      } catch {
        return new Response("unready", { status: 503 });
      }
    }

    if (url.pathname.startsWith("/openapi")) return openApiFetch(req, "/openapi");

    return rpcFetch(req, "/rpc");
  },
});

log({ requestId: newRequestId(), msg: "listening", service: "tenant", port: server.port });

registerShutdown({
  service: "tenant",
  server,
  onShutdown: async () => {
    await shutdownOtel();
    await disconnectDb();
  },
});
