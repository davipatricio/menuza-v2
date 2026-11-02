import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import type { ErrorComponentProps } from "@tanstack/react-router";

/**
 * Router-wide error boundary, wired as `defaultErrorComponent` in
 * `src/router.tsx`. Copy mirrors the Next `global-error.tsx` screen.
 */
export function ErrorBoundary({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // The `error` prop is deliberately not rendered: the Next screens only show a
  // digest, and TasStack hands back the raw error. Printing it would leak
  // server detail to buyers.
  return (
    <main className="grid min-h-svh place-content-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado.</h1>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground" role="alert">
        O erro foi registrado. Tente novamente.
      </p>
      <div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
