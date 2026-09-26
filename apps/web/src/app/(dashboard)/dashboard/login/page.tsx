import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { LoginForm } from "./login-form.tsx";

// Reads the session to redirect an already-authenticated visitor.
export const instant = false;

export const metadata: Metadata = {
  title: "Entrar — Menuza",
};

/**
 * Staff login. Neutral, sidebar-free screen (MEN-225): a thin app bar with the
 * brand and theme control, then a single centered card. No tenant context is
 * known before authentication, so nothing here reads the store.
 */
export default async function LoginPage() {
  const session = await getPanelSession();

  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-lg text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Store className="size-3.5" />
          </span>
          Menuza
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Entrar no painel</h1>
            <p className="text-sm text-pretty text-muted-foreground">
              Use a conta da sua loja para gerenciar catálogo, pedidos e equipe.
            </p>
          </div>

          <Card>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Ainda não tem uma loja?{" "}
            <Link
              href="/dashboard/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
