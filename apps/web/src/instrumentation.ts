/**
 * Next server instrumentation. `register` boots the runtime-specific Sentry
 * config once per server instance; `onRequestError` captures Server Component,
 * Route Handler, Server Action and proxy errors.
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.ts");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config.ts");
  }
}

export const onRequestError = Sentry.captureRequestError;
