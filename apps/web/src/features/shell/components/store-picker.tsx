/**
 * The store picker body: one card per membership plus the new-store card.
 *
 * The route resolves the session and renders this; the cards are plain links,
 * so nothing here reads data of its own.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import type { PanelSession } from "@/features/auth/server/session-client.ts";
import { initials } from "@/lib/format.ts";
import { ROLE_LABELS } from "@/lib/panel-labels.ts";

export function StorePicker({ session }: { session: PanelSession }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">Suas lojas</h1>
      <p className="text-sm text-pretty text-muted-foreground">
        Escolha uma loja para abrir o painel de gestão.
      </p>

      {session.memberships.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
          Você ainda não está em nenhuma loja. Crie a sua para começar.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {session.memberships.map((store) => (
            <li key={store.tenantId}>
              <Link
                to="/dashboard/$storeSlug"
                params={{ storeSlug: store.tenantSlug }}
                aria-label={`Abrir painel de ${store.tenantName}`}
                className="group/store block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="h-full gap-0 p-0 transition-[transform,box-shadow] duration-200 ease-out group-hover/store:-translate-y-0.5 group-hover/store:shadow-surface-hover group-focus-visible/store:shadow-surface-hover motion-reduce:transition-none motion-reduce:group-hover/store:translate-y-0">
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
                      <Badge variant="outline">{ROLE_LABELS[store.role]}</Badge>
                      <span className="font-mono text-xs">{store.tenantSlug}</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between px-4 pb-4">
                    <span className="text-sm font-medium text-muted-foreground">Abrir painel</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground transition-transform duration-200 ease-out group-hover/store:translate-x-0.5 group-hover/store:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/store:translate-0"
                    />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Link
          to="/dashboard/signup/loja"
          aria-label="Criar uma nova loja"
          className="group/new-store flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-[transform,border-color,background-color,box-shadow] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:border-ring/50 hover:bg-card hover:shadow-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-[transform,background-color,border-color,color] duration-300 ease-out group-hover/new-store:scale-105 group-hover/new-store:rotate-90 group-hover/new-store:border-transparent group-hover/new-store:bg-primary group-hover/new-store:text-primary-foreground motion-reduce:transition-none motion-reduce:group-hover/new-store:scale-100 motion-reduce:group-hover/new-store:rotate-0"
          >
            <Plus className="size-5" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-base font-medium">Nova loja</span>
            <span className="text-sm text-muted-foreground">Criar uma loja no Menuza</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
