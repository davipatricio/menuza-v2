import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { PanelMcpSession } from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { revokeMcpSessionFn } from "../server/integrations.functions.ts";

/**
 * The connected clients. Several members — and one member on several machines —
 * can hold a session at once, so each row is revocable on its own and names who
 * connected it.
 */
export function McpSessionsList({
  storeSlug,
  sessions,
  canRevoke,
}: {
  storeSlug: string;
  sessions: PanelMcpSession[];
  canRevoke: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(session: PanelMcpSession) {
    setPendingId(session.id);
    setError(null);

    try {
      const result = await revokeMcpSessionFn({ data: { storeSlug, sessionId: session.id } });

      if (result.status !== "ok") throw new Error(result.status);

      await router.invalidate();
    } catch {
      setError("Não foi possível revogar a sessão.");
    } finally {
      setPendingId(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-pretty text-muted-foreground">
        Nenhum cliente conectado ainda. Use o botão acima para conectar o primeiro.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border/60 rounded-lg border border-border/80">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{session.label}</span>
              <span className="text-xs text-muted-foreground">
                {session.memberName} · {session.clientName} · conectado em{" "}
                <span className="tabular-nums">{formatDateTime(session.createdAt)}</span>
              </span>
            </div>
            {canRevoke ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendingId === session.id}
                onClick={() => void revoke(session)}
              >
                {pendingId === session.id ? "Revogando…" : "Revogar"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
