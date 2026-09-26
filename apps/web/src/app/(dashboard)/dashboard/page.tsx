import { ViewTransition } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Store } from "lucide-react";
import type { SessionMembership } from "@menuza/shared/tenant";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { initials } from "@/lib/format.ts";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { HeaderActions } from "./_components/header-actions.tsx";
import { NewStoreCard } from "./_components/new-store-card.tsx";

// The picker reads the session (a request-time read), so it blocks on the
// server instead of prerendering an empty static shell.
export const instant = false;

const ROLE_LABELS: Record<SessionMembership["role"], string> = {
  owner: "Proprietário",
  admin: "Administrador",
  staff: "Atendimento",
};

function roleLabel(role: SessionMembership["role"]): string {
  return ROLE_LABELS[role];
}

/**
 * Store picker. Reads the real `menuza_tenant_sid` session and lists the
 * member's memberships; unauthenticated visitors go to the login screen.
 */
export default async function DashboardPickerPage() {
  const session = await getPanelSession();

  if (!session) redirect("/dashboard/login");

  const memberName = session.member.name ?? session.member.email;

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Store className="size-3.5" />
          </span>
          Menuza
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 sm:flex">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground"
            >
              {initials(memberName)}
            </span>
            <span className="text-sm font-medium">{memberName}</span>
          </span>
          <ThemeToggle />
          <HeaderActions showSwitcher={false} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <ViewTransition exit="store-enter">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Suas lojas</h1>
            <p className="text-sm text-pretty text-muted-foreground">
              Escolha uma loja para abrir o painel de gestão.
            </p>
          </div>

          {session.memberships.length === 0 ? (
            <p className="mt-10 rounded-xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
              Você ainda não está em nenhuma loja. Crie a sua para começar.
            </p>
          ) : (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {session.memberships.map((store) => (
                <li key={store.tenantId}>
                  <Link
                    href={`/dashboard/${store.tenantSlug}`}
                    aria-label={`Abrir painel de ${store.tenantName}`}
                    transitionTypes={["store-enter"]}
                    className="group/store block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground shadow-surface transition-[transform,box-shadow] duration-200 ease-out group-hover/store:-translate-y-0.5 group-hover/store:shadow-surface-hover group-focus-visible/store:shadow-surface-hover motion-reduce:transition-none motion-reduce:group-hover/store:translate-y-0">
                      <div
                        aria-hidden="true"
                        className="flex h-20 items-center justify-center border-b border-border bg-muted/40 transition-colors duration-200 group-hover/store:bg-muted/70 motion-reduce:transition-none"
                      >
                        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-transform duration-200 ease-out group-hover/store:scale-105 motion-reduce:transition-none motion-reduce:group-hover/store:scale-100">
                          {initials(store.tenantName)}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <h2 className="text-base leading-snug font-medium">{store.tenantName}</h2>
                        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium">
                            {roleLabel(store.role)}
                          </span>
                          <span className="font-mono text-xs">{store.tenantSlug}</span>
                        </p>
                      </div>
                      <div className="flex items-center justify-between px-4 pb-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          Abrir painel
                        </span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-4 text-muted-foreground transition-transform duration-200 ease-out group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/store:translate-0"
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <NewStoreCard />
          </div>
        </ViewTransition>
      </main>
    </div>
  );
}
