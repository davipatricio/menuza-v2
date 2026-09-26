"use client";

/**
 * Active sessions list with per-row revocation. A client island: the server page
 * reads the sessions and hands them down, then the island owns only the
 * revocation calls and the resulting list.
 *
 * The rows are keyed by the session row's SHA-256 digest — never the bearer
 * token — so echoing one back to `account.revokeSession` cannot leak a
 * credential into the page or into a network log.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActiveSession } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { revokeOtherSessions, revokeSession } from "@/lib/session-client.ts";

export function SessionsList({ sessions }: { sessions: ActiveSession[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(sessions);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(target: string) {
    startTransition(async () => {
      try {
        const revoked = await revokeSession(target);

        setRows((current) => current.filter((row) => row.id !== target));
        setMessage(revoked === 1 ? "Sessão encerrada." : "Essa sessão já não estava ativa.");
        router.refresh();
      } catch {
        setMessage("Não foi possível encerrar a sessão.");
      }
    });
  }

  function revokeOthers() {
    startTransition(async () => {
      try {
        const revoked = await revokeOtherSessions();

        setRows((current) => current.filter((row) => row.current));
        setMessage(
          revoked === 0
            ? "Nenhuma outra sessão estava ativa."
            : revoked === 1
              ? "1 sessão encerrada."
              : `${revoked} sessões encerradas.`,
        );
        router.refresh();
      } catch {
        setMessage("Não foi possível encerrar as outras sessões.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {session.current ? "Esta sessão" : "Outra sessão"}
                </span>
                {session.current ? <Badge variant="secondary">atual</Badge> : null}
              </div>
              <span className="text-xs text-muted-foreground">
                Criada em {formatDateTime(session.createdAt)} · último uso{" "}
                {formatDateTime(session.lastUsedAt)} · expira em {formatDateTime(session.expiresAt)}
              </span>
            </div>

            {session.current ? null : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => revoke(session.id)}
              >
                Encerrar
              </Button>
            )}
          </li>
        ))}
      </ul>

      {rows.length > 1 ? (
        <Button variant="outline" disabled={pending} onClick={revokeOthers} className="self-start">
          Encerrar todas as outras
        </Button>
      ) : null}

      <output className="block text-sm text-muted-foreground" aria-live="polite">
        {message ?? ""}
      </output>
    </div>
  );
}
