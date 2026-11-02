/**
 * Quick actions on the overview, ported from `apps/web`'s `overview-nav.tsx`.
 *
 * Only routes that exist in this tree are links; the rest stay disabled with the
 * plan step that ships them (same shape as `nav-config.ts`).
 */
import { Link } from "@tanstack/react-router";
import { BookOpen, Settings, ShoppingCart, type LucideIcon } from "lucide-react";

export interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Present only for routes that exist in the tree. */
  to?:
    | "/dashboard/$storeSlug"
    | "/dashboard/$storeSlug/orders"
    | "/dashboard/$storeSlug/catalog/products";
  disabled?: boolean;
}

/**
 * The Next page's quick actions. Settings stay disabled until S44–S46 add those
 * routes; the other two point at the lists that already exist.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  { key: "orders", label: "Ver pedidos", icon: ShoppingCart, to: "/dashboard/$storeSlug/orders" },
  {
    key: "products",
    label: "Ver catálogo",
    icon: BookOpen,
    to: "/dashboard/$storeSlug/catalog/products",
  },
  { key: "store-settings", label: "Configurações da loja", icon: Settings, disabled: true },
];

export function OverviewNav({
  storeSlug,
  actions = QUICK_ACTIONS,
}: {
  storeSlug: string;
  actions?: QuickAction[];
}) {
  return (
    <nav aria-label="Ações rápidas" className="flex flex-col gap-3">
      <p className="text-sm font-medium">Ações rápidas</p>
      <ul className="flex flex-col gap-2">
        {actions.map((action) => (
          <li key={action.key}>
            {action.disabled || !action.to ? (
              <span
                aria-disabled="true"
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground opacity-60"
              >
                <action.icon aria-hidden="true" className="size-4 shrink-0" />
                {action.label}
              </span>
            ) : (
              <Link
                to={action.to}
                params={{ storeSlug }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <action.icon aria-hidden="true" className="size-4 shrink-0" />
                {action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
