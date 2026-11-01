import type { PanelSearchItem, PanelSearchOutput } from "@menuza/shared/tenant";

/** One entity group exactly as `panel.search` returns it. */
export type PanelSearchGroup = PanelSearchOutput["groups"][number];

export interface PageSearchItem {
  kind: "page";
  id: string;
  label: string;
  href: string;
  section?: string;
}

export type EntitySearchItem = PanelSearchItem;

export type SearchItem = EntitySearchItem | PageSearchItem;

export interface SearchGroup {
  kind: SearchItem["kind"];
  label: string;
  items: SearchItem[];
}

export type MoveKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** pt-BR group headings, keyed by result kind. */
export const GROUP_LABELS = {
  page: "Páginas",
  product: "Produtos",
  coupon: "Cupons",
  customer: "Clientes",
  tag: "Tags",
  category: "Categorias",
  department: "Departamentos",
  badge: "Etiquetas",
  subcategory: "Subcategorias",
} satisfies Record<SearchItem["kind"], string>;

/** Páginas first, then the entity kinds in the order the palette shows them. */
const GROUP_ORDER = [
  "page",
  "product",
  "coupon",
  "customer",
  "tag",
  "category",
  "department",
  "badge",
  "subcategory",
] satisfies SearchItem["kind"][];

export function orderGroups(groups: SearchGroup[]): SearchGroup[] {
  return [...groups].sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind));
}

export function mergeGroups(
  entityGroups: PanelSearchGroup[],
  pageItems: PageSearchItem[] = [],
): SearchGroup[] {
  const groups: SearchGroup[] = entityGroups.map((group) => ({
    kind: group.kind,
    label: GROUP_LABELS[group.kind],
    items: group.items,
  }));

  if (pageItems.length > 0) {
    groups.unshift({ kind: "page", label: GROUP_LABELS.page, items: pageItems });
  }

  return orderGroups(groups.filter((group) => group.items.length > 0));
}

/** One flat list in render order, so the keyboard index math matches what is drawn. */
export function flattenGroups(groups: SearchGroup[]): SearchItem[] {
  return groups.flatMap((group) => group.items);
}

/** Keeps a cursor inside the current list; an empty list has no cursor at all. */
export function clampIndex(length: number, index: number): number {
  if (length === 0) return -1;

  return Math.min(Math.max(index, 0), length - 1);
}

export function moveIndex(length: number, current: number, key: MoveKey): number {
  if (length <= 0) return -1;

  const last = length - 1;

  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % length;
    case "ArrowUp":
      return current <= 0 ? last : current - 1;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}

/** Inline writes exist only for coupons and products, and only with `catalog:write`. */
export function canMutate(kind: SearchItem["kind"], canWrite: boolean): boolean {
  return canWrite && (kind === "coupon" || kind === "product");
}
