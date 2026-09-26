"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShoppingCart,
  Ticket,
  Users,
} from "lucide-react";
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
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { initials } from "@/lib/format.ts";
import { StoreSwitcher, type SwitcherStore } from "./store-switcher.tsx";
import { UserMenu } from "./user-menu.tsx";

type NavIcon = typeof LayoutDashboard;

interface NavLeaf {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavLeaf[];
}

const SETTINGS_CHILDREN: Array<{ href: string; label: string }> = [
  { href: "store", label: "Loja" },
  { href: "delivery", label: "Entrega" },
  { href: "payments", label: "Pagamentos" },
  { href: "notifications", label: "Notificações" },
  { href: "team", label: "Equipe" },
  { href: "account", label: "Conta" },
];

function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinkStatic({ item, active }: { item: NavLeaf; active: boolean }) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} aria-label={item.label} />}
        isActive={active}
        tooltip={item.label}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavLinkItem({ item }: { item: NavLeaf }) {
  const pathname = usePathname();

  return <NavLinkStatic item={item} active={isActivePath(pathname, item.href, item.exact)} />;
}

function SettingsGroupStatic({
  basePath,
  open,
  activeHref,
}: {
  basePath: string;
  open: boolean;
  activeHref: string | null;
}) {
  const settingsBase = `${basePath}/settings`;

  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen={open} className="group/collapsible">
        <CollapsibleTrigger render={<SidebarMenuButton tooltip="Configurações" isActive={open} />}>
          <Settings aria-hidden="true" />
          <span>Configurações</span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto transition-transform group-data-open/collapsible:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {SETTINGS_CHILDREN.map((child) => {
              const href = `${settingsBase}/${child.href}`;

              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    render={<Link href={href} aria-label={child.label} />}
                    isActive={href === activeHref}
                  >
                    <span>{child.label}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function SettingsGroup({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const { state, setOpen } = useSidebar();
  const settingsBase = `${basePath}/settings`;
  const open = pathname === settingsBase || pathname.startsWith(`${settingsBase}/`);
  const collapsed = state === "collapsed";

  return (
    <Suspense fallback={<SettingsGroupStatic basePath={basePath} open={false} activeHref={null} />}>
      {collapsed ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link href={`${settingsBase}/store`} aria-label="Configurações" />}
            isActive={open}
            tooltip="Configurações"
            onClick={() => setOpen(true)}
          >
            <Settings aria-hidden="true" />
            <span>Configurações</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <SettingsGroupStatic basePath={basePath} open={open} activeHref={open ? pathname : null} />
      )}
    </Suspense>
  );
}

function MobileSidebarCloser() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  // The mobile sidebar renders in a Sheet: close it on navigation.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return null;
}

export function AppSidebar({
  basePath,
  storeName,
  currentSlug,
  stores,
  currentRole,
  userName,
  role,
}: {
  basePath: string;
  storeName: string;
  currentSlug: string;
  stores: SwitcherStore[];
  currentRole: string;
  userName: string;
  role: string;
}) {
  const { setOpen } = useSidebar();

  const groups: NavGroup[] = [
    {
      label: "Operação",
      items: [
        { href: basePath, label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: `${basePath}/orders`, label: "Pedidos", icon: ShoppingCart },
        { href: `${basePath}/catalog`, label: "Catálogo", icon: BookOpen },
      ],
    },
    {
      label: "Relacionamento",
      items: [
        { href: `${basePath}/customers`, label: "Clientes", icon: Users },
        { href: `${basePath}/coupons`, label: "Cupons", icon: Ticket },
        { href: `${basePath}/audit`, label: "Auditoria", icon: ScrollText },
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="group-data-[collapsible=icon]:hidden">
          <StoreSwitcher
            stores={stores}
            currentSlug={currentSlug}
            currentName={storeName}
            currentRole={currentRole}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Trocar de loja. Loja atual: ${storeName}`}
          title={storeName}
          onClick={() => setOpen(true)}
          className="hidden bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground transition-transform duration-200 ease-out group-data-[collapsible=icon]:flex motion-reduce:transition-none"
        >
          <span aria-hidden="true">{initials(storeName)}</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <Suspense key={item.href} fallback={<NavLinkStatic item={item} active={false} />}>
                    <NavLinkItem item={item} />
                  </Suspense>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Suspense
                fallback={
                  <SettingsGroupStatic basePath={basePath} open={false} activeHref={null} />
                }
              >
                <SettingsGroup basePath={basePath} />
              </Suspense>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu userName={userName} role={role} />
        <div className="group-data-[collapsible=icon]:hidden">
          <ThemeToggle />
        </div>
        <div className="hidden justify-center group-data-[collapsible=icon]:flex">
          <ThemeToggle compact />
        </div>
      </SidebarFooter>
      <SidebarRail />
      <Suspense fallback={null}>
        <MobileSidebarCloser />
      </Suspense>
    </Sidebar>
  );
}
