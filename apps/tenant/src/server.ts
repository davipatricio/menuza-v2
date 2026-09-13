/**
 * Tenant management API process. Bun.serve on loopback.
 * Imports the router from `@menuza/api-tenant` and owns the process lifecycle.
 * Deny-by-default: only the health endpoint is exposed in this phase.
 */
import {
  buildRpcFetch,
  initSentry,
  log,
  newRequestId,
  registerShutdown,
} from "@menuza/orpc-server";
import { disconnectDb } from "@menuza/db/client";
import { prisma } from "@menuza/db";
import { tenantDomainRouter } from "@menuza/api-tenant";

initSentry({ service: "tenant" });

const port = Number(process.env.TENANT_PORT ?? 3002);

// Loopback by default; Docker sets HOST=0.0.0.0 to publish the port.
const hostname = process.env.HOST ?? "127.0.0.1";

const rpcFetch = buildRpcFetch(tenantDomainRouter, { service: "tenant" });

const server = Bun.serve({
  port,
  hostname,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/livez") return new Response("ok", { status: 200 });

    if (url.pathname === "/readyz") {
      try {
        await prisma.$queryRaw`SELECT 1`;

        return new Response("ok", { status: 200 });
      } catch {
        return new Response("unready", { status: 503 });
      }
    }

    return rpcFetch(req, "/rpc");
  },
});

log({ requestId: newRequestId(), msg: "listening", service: "tenant", port: server.port });

registerShutdown({
  service: "tenant",
  server,
  onShutdown: async () => {
    await disconnectDb();
  },
});
