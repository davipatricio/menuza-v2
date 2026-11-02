/**
 * The store shell frame: sidebar plus inset, no data reads of its own.
 *
 * The layout route resolves the store and the session (both already authorized
 * by the tenant API, which is the only authority) and hands them down; this file
 * only decides where chrome sits.
 */
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { KomiAssistant } from "@/features/assistant/components/komi-assistant.tsx";
import type { PanelSession } from "@/features/auth/server/session-client.ts";
import type { PanelStore } from "@/features/shell/server/store.functions.ts";
import { ROLE_LABELS } from "@/lib/panel-labels.ts";
import { AppSidebar } from "./app-sidebar.tsx";
import { CrumbLabelsProvider } from "./crumb-labels.tsx";
import { GlobalSearch } from "./global-search.tsx";
import { HeaderActions } from "./header-actions.tsx";
import { StoreBreadcrumb } from "./store-breadcrumb.tsx";

export function StoreShell({
  store,
  session,
  children,
}: {
  store: PanelStore;
  session: PanelSession;
  children: ReactNode;
}) {
  const memberName = store.member.name ?? store.member.email;

  return (
    <CrumbLabelsProvider>
      <SidebarProvider>
        <AppSidebar store={store} session={session} />
        <SidebarInset>
          <h1 className="sr-only">{store.tenantName}</h1>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger aria-label="Alternar navegação" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <StoreBreadcrumb store={store} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2.5 pl-2 text-xs font-medium text-muted-foreground sm:flex">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                <span>{memberName}</span>
                <span aria-hidden="true" className="text-border">
                  |
                </span>
                <span className="text-foreground">{ROLE_LABELS[store.role]}</span>
              </span>
              <HeaderActions />
              <GlobalSearch storeSlug={store.tenantSlug} />
            </div>
          </header>
          <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">{children}</div>
        </SidebarInset>
        <KomiAssistant />
      </SidebarProvider>
    </CrumbLabelsProvider>
  );
}
