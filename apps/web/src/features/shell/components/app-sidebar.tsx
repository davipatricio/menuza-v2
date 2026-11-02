/**
 * The dashboard sidebar: store header, nav groups, settings submenu and footer.
 *
 * Rendered inside `StoreShell`'s `SidebarProvider`; this file owns only the
 * `Sidebar` column content, the frame stays in `store-shell.tsx`.
 */
import { useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import type { PanelSession } from "@/features/auth/server/session-client.ts";
import type { PanelStore } from "@/features/shell/server/store.functions.ts";
import { initials } from "@/lib/format.ts";
import { ROLE_LABELS } from "@/lib/panel-labels.ts";
import { navGroupsFor, SETTINGS_CHILDREN, settingsHref } from "./nav-config.ts";
import { StoreSwitcher, type SwitcherStore } from "./store-switcher.tsx";
import { UserMenu } from "./user-menu.tsx";

function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SettingsGroup({ storeSlug }: { storeSlug: string }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { state, setOpen } = useSidebar();
  const settingsBase = `/dashboard/${storeSlug}/settings`;

  const activeHref =
    pathname === settingsBase || pathname.startsWith(`${settingsBase}/`) ? pathname : null;

  const collapsed = state === "collapsed";
  const inSettings = activeHref !== null;

  return (
    <SidebarMenuItem>
      {/* The key remounts the group when the route enters settings, so the
          `defaultOpen` state below behaves like the Next sidebar's and the user
          can still collapse it afterwards. */}
      <Collapsible
        key={inSettings ? "settings" : "idle"}
        defaultOpen={collapsed ? false : inSettings}
        className="group/collapsible"
      >
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              tooltip="Configurações"
              isActive={activeHref !== null}
              onClick={() => setOpen(true)}
            />
          }
        >
          <Settings aria-hidden="true" />
          <span>Configurações</span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto transition-transform group-data-open/collapsible:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {SETTINGS_CHILDREN.map((child) => (
              <SidebarMenuSubItem key={child.key}>
                <SidebarMenuSubButton
                  render={<Link to={child.to} params={{ storeSlug }} aria-label={child.label} />}
                  isActive={activeHref === settingsHref(storeSlug, child.key)}
                >
                  <span>{child.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function MobileSidebarCloser() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { setOpenMobile } = useSidebar();

  // The mobile sidebar renders in a Sheet: close it on navigation.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return null;
}

export function AppSidebar({ store, session }: { store: PanelStore; session: PanelSession }) {
  const { setOpen } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const groups = navGroupsFor(store.tenantSlug);
  const currentRole = ROLE_LABELS[store.role];
  const userName = store.member.name ?? store.member.email;

  const stores: SwitcherStore[] = session.memberships.map((membership) => ({
    slug: membership.tenantSlug,
    displayName: membership.tenantName,
    roleLabel: ROLE_LABELS[membership.role],
  }));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="group-data-[collapsible=icon]:hidden">
          <StoreSwitcher
            stores={stores}
            currentSlug={store.tenantSlug}
            currentName={store.tenantName}
            currentRole={currentRole}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Trocar de loja. Loja atual: ${store.tenantName}`}
          title={store.tenantName}
          onClick={() => setOpen(true)}
          className="hidden bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground transition-transform duration-200 ease-out group-data-[collapsible=icon]:flex motion-reduce:transition-none"
        >
          <span aria-hidden="true">{initials(store.tenantName)}</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;

                  if (item.disabled || !item.to) {
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton disabled tooltip={item.label}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  const href = item.href ?? "";

                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        render={
                          <Link
                            to={item.to}
                            params={{ storeSlug: store.tenantSlug }}
                            aria-label={item.label}
                          />
                        }
                        isActive={isActivePath(pathname, href, item.exact)}
                        tooltip={item.label}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SettingsGroup storeSlug={store.tenantSlug} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu userName={userName} role={currentRole} />
        <div className="group-data-[collapsible=icon]:hidden">
          <ThemeToggle />
        </div>
        <div className="hidden justify-center group-data-[collapsible=icon]:flex">
          <ThemeToggle compact />
        </div>
      </SidebarFooter>
      <SidebarRail />
      <MobileSidebarCloser />
    </Sidebar>
  );
}
