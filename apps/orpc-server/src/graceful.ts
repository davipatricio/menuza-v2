/**
 * Graceful shutdown helper for Bun.serve servers.
 *
 * Why this exists: the previous `server.stop(); process.exit(0)` pattern
 * abandons in-flight requests and loses Sentry/OTel spans. We use Bun's
 * `server.stop()` semantics and flush Sentry events before exit.
 */
import type { Server } from "bun";
import * as Sentry from "@sentry/bun";
import { log, newRequestId } from "./logging.ts";

/** Bun's Server<T> is generic over WebSocket data; we don't use WS here. */
type AnyServer = Server<unknown>;

export type ReadinessChecker = () => Promise<boolean> | boolean;

export interface RegisterShutdownOptions {
  service: string;
  server: AnyServer;
  /** Called once shutdown begins. Use to close DB pools, drain queues, etc. */
  onShutdown?: () => Promise<void> | void;
  /** Drain window for `server.stop()` before forced exit. Default 10s. */
  drainMs?: number;
}

export function registerShutdown(opts: RegisterShutdownOptions): void {
  const shuttingDown = { done: false };

  const handler = async (signal: NodeJS.Signals | "beforeExit") => {
    if (shuttingDown.done) return;
    shuttingDown.done = true;
    log({ requestId: newRequestId(), msg: "shutdown begin", service: opts.service, signal });

    const drainTimer = setTimeout(() => {
      log({ requestId: newRequestId(), msg: "shutdown drain timeout", service: opts.service });
      process.exit(1);
    }, opts.drainMs ?? 10_000);

    drainTimer.unref?.();

    try {
      // Stop accepting new connections, then wait for in-flight requests.
      await opts.server.stop(true);

      // Application-defined cleanup (DB pools, queue connections).
      if (opts.onShutdown) {
        await opts.onShutdown();
      }

      // Flush Sentry events if initialized.
      await Sentry.flush(2_000).catch(() => {});
    } catch (err) {
      log({
        requestId: newRequestId(),
        level: "error",
        msg: "shutdown error",
        service: opts.service,
        err: String(err),
      });
    } finally {
      clearTimeout(drainTimer);
      log({ requestId: newRequestId(), msg: "shutdown complete", service: opts.service });
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void handler("SIGINT"));
  process.on("SIGTERM", () => void handler("SIGTERM"));
}
