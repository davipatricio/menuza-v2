"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ORPCError } from "@orpc/client";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { changePassword } from "@/lib/session-client.ts";

const GENERIC_ERROR = "Não foi possível trocar a senha. Tente novamente.";

/**
 * Password change. Changing the password revokes every other session, so the
 * copy says so: a member who does not expect their other devices to sign out
 * reads it as a bug. The current session survives, which is why the form does
 * not navigate away on success.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(null);

    if (newPassword !== confirmation) {
      setError("As senhas novas não conferem.");

      return;
    }

    setPending(true);

    try {
      const result = await changePassword({ currentPassword, newPassword });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");

      setDone(
        result.changed
          ? "Senha trocada. As demais sessões foram encerradas."
          : "A nova senha é igual à atual. Nenhuma sessão foi encerrada.",
      );

      // The other sessions are gone, so the session list below is stale.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ORPCError && err.code === "UNAUTHORIZED"
          ? "Senha atual incorreta."
          : GENERIC_ERROR,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          disabled={pending}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          disabled={pending}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Repita a nova senha</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmation}
          disabled={pending}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          {done}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? (
          <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
        ) : null}
        {pending ? "Salvando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
