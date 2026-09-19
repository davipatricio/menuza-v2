"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root error boundary. Replaces the root layout when a render error escapes,
 * so it must render its own `<html>`/`<body>` and cannot rely on global styles.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main
          style={{
            display: "grid",
            gap: "1rem",
            placeContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem" }}>Algo deu errado.</h1>
          <p style={{ color: "#555" }}>O erro foi registrado. Tente novamente.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ justifySelf: "center", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
