import { describe, expect, test } from "bun:test";
import {
  GROUP_LABELS,
  canMutate,
  clampIndex,
  flattenGroups,
  mergeGroups,
  moveIndex,
  orderGroups,
  type EntitySearchItem,
  type PageSearchItem,
  type PanelSearchGroup,
  type SearchItem,
} from "../src/app/(dashboard)/dashboard/[storeSlug]/_components/global-search-utils.ts";

function entityItem(kind: EntitySearchItem["kind"], id: string, label: string): EntitySearchItem {
  return { kind, id, label, href: `/dashboard/loja/${id}` };
}

function entityGroup(kind: PanelSearchGroup["kind"], items: EntitySearchItem[]): PanelSearchGroup {
  return { kind, items };
}

const pageItems: PageSearchItem[] = [
  {
    kind: "page",
    id: "/dashboard/loja",
    label: "Dashboard",
    href: "/dashboard/loja",
    section: "Operação",
  },
  {
    kind: "page",
    id: "/dashboard/loja/orders",
    label: "Pedidos",
    href: "/dashboard/loja/orders",
    section: "Operação",
  },
];

const kinds = (groups: { kind: SearchItem["kind"] }[]) => groups.map((group) => group.kind);

const labels = (items: SearchItem[]) => items.map((item) => item.label);

describe("mergeGroups", () => {
  test("puts the page group first and labels it in pt-BR", () => {
    const groups = mergeGroups(
      [
        entityGroup("product", [entityItem("product", "p1", "Café")]),
        entityGroup("coupon", [entityItem("coupon", "c1", "BEMVINDO")]),
      ],
      pageItems,
    );

    expect(kinds(groups)).toEqual(["page", "product", "coupon"]);
    expect(groups[0]?.label).toBe(GROUP_LABELS.page);
    expect(groups[1]?.label).toBe(GROUP_LABELS.product);
    expect(labels(groups[0]?.items ?? [])).toEqual(["Dashboard", "Pedidos"]);
  });

  test("drops empty groups and keeps a single matching entity group", () => {
    const groups = mergeGroups([
      entityGroup("product", []),
      entityGroup("tag", [entityItem("tag", "t1", "Quente")]),
      entityGroup("badge", []),
    ]);

    expect(kinds(groups)).toEqual(["tag"]);
    expect(groups[0]?.label).toBe("Tags");
  });

  test("adds no page group when no page matches", () => {
    const groups = mergeGroups(
      [entityGroup("customer", [entityItem("customer", "u1", "Ana")])],
      [],
    );

    expect(kinds(groups)).toEqual(["customer"]);
  });

  test("orders entity groups by kind, not by response order", () => {
    const groups = mergeGroups(
      [
        entityGroup("subcategory", [entityItem("subcategory", "s1", "Quentes")]),
        entityGroup("badge", [entityItem("badge", "b1", "Novo")]),
        entityGroup("department", [entityItem("department", "d1", "Cozinha")]),
        entityGroup("category", [entityItem("category", "c1", "Bebidas")]),
        entityGroup("customer", [entityItem("customer", "u1", "Ana")]),
      ],
      pageItems,
    );

    expect(kinds(groups)).toEqual([
      "page",
      "customer",
      "category",
      "department",
      "badge",
      "subcategory",
    ]);
  });

  test("returns every kind in the documented order after orderGroups", () => {
    const groups = orderGroups([
      { kind: "coupon", label: GROUP_LABELS.coupon, items: [] },
      { kind: "product", label: GROUP_LABELS.product, items: [] },
      { kind: "page", label: GROUP_LABELS.page, items: [] },
    ]);

    expect(kinds(groups)).toEqual(["page", "product", "coupon"]);
  });
});

describe("flattenGroups", () => {
  test("keeps group order and item order stable", () => {
    const groups = mergeGroups(
      [
        entityGroup("product", [
          entityItem("product", "p1", "Café"),
          entityItem("product", "p2", "Pão"),
        ]),
        entityGroup("coupon", [entityItem("coupon", "c1", "BEMVINDO")]),
      ],
      pageItems,
    );

    expect(labels(flattenGroups(groups))).toEqual([
      "Dashboard",
      "Pedidos",
      "Café",
      "Pão",
      "BEMVINDO",
    ]);
    expect(flattenGroups([])).toEqual([]);
  });
});

describe("clampIndex", () => {
  test("has no cursor in an empty list", () => {
    expect(clampIndex(0, 0)).toBe(-1);
    expect(clampIndex(0, 4)).toBe(-1);
  });

  test("pulls a negative index to the first item", () => {
    expect(clampIndex(3, -2)).toBe(0);
  });

  test("pulls an index past the last item back to it", () => {
    expect(clampIndex(3, 9)).toBe(2);
  });

  test("leaves an in-range index alone", () => {
    expect(clampIndex(3, 1)).toBe(1);
  });
});

describe("moveIndex", () => {
  test("returns -1 for an empty list on every key", () => {
    expect(moveIndex(0, -1, "ArrowDown")).toBe(-1);
    expect(moveIndex(0, -1, "ArrowUp")).toBe(-1);
    expect(moveIndex(0, -1, "Home")).toBe(-1);
    expect(moveIndex(0, -1, "End")).toBe(-1);
  });

  test("moves down from no selection and wraps at the end", () => {
    expect(moveIndex(3, -1, "ArrowDown")).toBe(0);
    expect(moveIndex(3, 0, "ArrowDown")).toBe(1);
    expect(moveIndex(3, 1, "ArrowDown")).toBe(2);
    expect(moveIndex(3, 2, "ArrowDown")).toBe(0);
  });

  test("moves up from no selection and wraps at the start", () => {
    expect(moveIndex(3, -1, "ArrowUp")).toBe(2);
    expect(moveIndex(3, 2, "ArrowUp")).toBe(1);
    expect(moveIndex(3, 1, "ArrowUp")).toBe(0);
    expect(moveIndex(3, 0, "ArrowUp")).toBe(2);
  });

  test("jumps to the first and last item", () => {
    expect(moveIndex(5, 3, "Home")).toBe(0);
    expect(moveIndex(5, 1, "End")).toBe(4);
    expect(moveIndex(1, 0, "Home")).toBe(0);
    expect(moveIndex(1, 0, "End")).toBe(0);
  });
});

describe("canMutate", () => {
  const allKinds = [
    "page",
    "product",
    "coupon",
    "customer",
    "tag",
    "category",
    "department",
    "badge",
    "subcategory",
  ] as const;

  test("allows only coupons and products when the store can write", () => {
    expect(allKinds.filter((kind) => canMutate(kind, true))).toEqual(["product", "coupon"]);
  });

  test("never allows a write without permission", () => {
    expect(allKinds.filter((kind) => canMutate(kind, false))).toEqual([]);
  });
});
