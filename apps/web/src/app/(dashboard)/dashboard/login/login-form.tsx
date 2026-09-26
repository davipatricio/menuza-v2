"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ORPCError } from "@orpc/client";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { loginSession } from "@/lib/session-client.ts";

const GENERIC_ERROR = "Não foi possível entrar. Tente novamente.";

/**
 * Staff login form. Posts to `session.login` on the same-origin tenant API; the
 * API's `Set-Cookie` lands on this origin, then we leave through the router so
 * the dashboard's server components see the new session.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await loginSession({ email: email.trim(), password });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ORPCError && err.code === "UNAUTHORIZED"
          ? "E-mail ou senha incorretos."
          : GENERIC_ERROR,
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
          value={email}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p
          id="login-error"
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
        ) : null}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
