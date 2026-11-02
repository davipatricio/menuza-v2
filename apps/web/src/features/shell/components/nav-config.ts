/**
 * Dashboard navigation data, mirroring the Next sidebar: the first group is
 * "Operação", the settings screens live in their own collapsible group.
 *
 * `to` stays a typed route template for `<Link>`; `href` is the same path with
 * the current slug filled in, used only for active-state matching.
 */
import {
  Award,
  Boxes,
  FolderTree,
  Layers,
  LayoutDashboard,
  ListTree,
  Package,
  Puzzle,
  ScrollText,
  Settings,
  ShoppingCart,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

type NavIcon = typeof LayoutDashboard;

export type SettingsPath =
  | "/dashboard/$storeSlug/settings/store"
  | "/dashboard/$storeSlug/settings/delivery"
  | "/dashboard/$storeSlug/settings/payments"
  | "/dashboard/$storeSlug/settings/notifications"
  | "/dashboard/$storeSlug/settings/team"
  | "/dashboard/$storeSlug/settings/account";

export interface NavChild {
  key: string;
  label: string;
  to: SettingsPath;
}

export interface NavItem {
  key: string;
  label: string;
  icon: NavIcon;
  /** Present only for routes that exist in the tree. */
  to?:
    | "/dashboard/$storeSlug"
    | "/dashboard/$storeSlug/catalog/products"
    | "/dashboard/$storeSlug/catalog/kits"
    | "/dashboard/$storeSlug/catalog/departments"
    | "/dashboard/$storeSlug/catalog/categories"
    | "/dashboard/$storeSlug/catalog/subcategories"
    | "/dashboard/$storeSlug/catalog/tags"
    | "/dashboard/$storeSlug/catalog/badges"
    | "/dashboard/$storeSlug/coupons"
    | "/dashboard/$storeSlug/customers"
    | "/dashboard/$storeSlug/orders"
    | "/dashboard/$storeSlug/audit"
    | "/dashboard/$storeSlug/integrations"
    | SettingsPath;
  /** Exact match only — the store root would otherwise stay active everywhere. */
  exact?: boolean;
  disabled?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/** A nav item with the store slug filled in, for active-state matching only. */
export interface ResolvedNavItem extends NavItem {
  href?: string;
}

export interface ResolvedNavGroup {
  key: string;
  label: string;
  items: ResolvedNavItem[];
}

/** The settings screens, in the order the Next sidebar nested them. */
export const SETTINGS_CHILDREN: NavChild[] = [
  { key: "store", label: "Loja", to: "/dashboard/$storeSlug/settings/store" },
  { key: "delivery", label: "Entrega", to: "/dashboard/$storeSlug/settings/delivery" },
  { key: "payments", label: "Pagamentos", to: "/dashboard/$storeSlug/settings/payments" },
  {
    key: "notifications",
    label: "Notificações",
    to: "/dashboard/$storeSlug/settings/notifications",
  },
  { key: "team", label: "Equipe", to: "/dashboard/$storeSlug/settings/team" },
  { key: "account", label: "Conta", to: "/dashboard/$storeSlug/settings/account" },
];

/** The settings screens render as their own collapsible group, not in `NAV_GROUPS`. */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "operacao",
    label: "Operação",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        to: "/dashboard/$storeSlug",
        exact: true,
      },
      { key: "orders", label: "Pedidos", icon: ShoppingCart, to: "/dashboard/$storeSlug/orders" },
    ],
  },
  {
    key: "catalogo",
    label: "Catálogo",
    items: [
      {
        key: "products",
        label: "Produtos",
        icon: Package,
        to: "/dashboard/$storeSlug/catalog/products",
      },
      {
        key: "kits",
        label: "Kits",
        icon: Boxes,
        to: "/dashboard/$storeSlug/catalog/kits",
      },
      {
        key: "departments",
        label: "Departamentos",
        icon: Layers,
        to: "/dashboard/$storeSlug/catalog/departments",
      },
      {
        key: "categories",
        label: "Categorias",
        icon: FolderTree,
        to: "/dashboard/$storeSlug/catalog/categories",
      },
      {
        key: "subcategories",
        label: "Subcategorias",
        icon: ListTree,
        to: "/dashboard/$storeSlug/catalog/subcategories",
      },
      {
        key: "tags",
        label: "Tags",
        icon: Tag,
        to: "/dashboard/$storeSlug/catalog/tags",
      },
      {
        key: "badges",
        label: "Etiquetas",
        icon: Award,
        to: "/dashboard/$storeSlug/catalog/badges",
      },
    ],
  },
  {
    key: "relacionamento",
    label: "Relacionamento",
    items: [
      { key: "customers", label: "Clientes", icon: Users, to: "/dashboard/$storeSlug/customers" },
      { key: "coupons", label: "Cupons", icon: Ticket, to: "/dashboard/$storeSlug/coupons" },
      { key: "audit", label: "Auditoria", icon: ScrollText, to: "/dashboard/$storeSlug/audit" },
    ],
  },
  {
    key: "sistema",
    label: "Sistema",
    items: [
      {
        key: "integrations",
        label: "Integrações",
        icon: Puzzle,
        to: "/dashboard/$storeSlug/integrations",
      },
    ],
  },
];

/** The static groups with the slug filled in for active-state matching. */
export function navGroupsFor(storeSlug: string): ResolvedNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.items.map((item) => ({
      ...item,
      href: item.to?.replace("$storeSlug", storeSlug),
    })),
  }));
}

/** `/dashboard/<slug>/settings/<key>` — the path a settings child links to. */
export function settingsHref(storeSlug: string, key: string): string {
  return `/dashboard/${storeSlug}/settings/${key}`;
}

/** Kept for the settings icon reference in the sidebar. */
export const SETTINGS_ICON = Settings;
