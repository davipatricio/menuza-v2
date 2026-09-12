/**
 * Commerce API process. Bun.serve on loopback.
 * Imports the router from `@menuza/api-commerce` and owns the process lifecycle.
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
import { commerceDomainRouter } from "@menuza/api-commerce";

initSentry({ service: "commerce" });

const port = Number(process.env.COMMERCE_PORT ?? 3001);
// Loopback by default; Docker sets HOST=0.0.0.0 to publish the port.
const hostname = process.env.HOST ?? "127.0.0.1";

const rpcFetch = buildRpcFetch(commerceDomainRouter, { service: "commerce" });

const server = Bun.serve({
  port,
  hostname,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/livez") return new Response("ok", { status: 200 });

    if (url.pathname === "/readyz") {
      // Real readiness: the process is only "ready" when the DB answers.
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

log({ requestId: newRequestId(), msg: "listening", service: "commerce", port: server.port });

registerShutdown({
  service: "commerce",
  server,
  onShutdown: async () => {
    await disconnectDb();
  },
});
