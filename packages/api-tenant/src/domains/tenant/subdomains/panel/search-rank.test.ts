import { describe, expect, test } from "bun:test";
import type { PanelSearchItem } from "@menuza/shared/tenant";
import { rankPanelSearchItems } from "./search-rank.ts";

function item(id: string, label: string): PanelSearchItem {
  return { kind: "product", id, label, href: `/dashboard/loja/catalog/products/${id}` };
}

const ids = (items: readonly PanelSearchItem[]) => items.map((entry) => entry.id);

describe("rankPanelSearchItems", () => {
  test("puts prefix matches before the rest", () => {
    const ranked = rankPanelSearchItems(
      [item("1", "Bolo"), item("2", "Casa"), item("3", "Café")],
      "ca",
    );

    expect(ids(ranked)).toEqual(["3", "2", "1"]);
  });

  test("matches case-insensitively", () => {
    const ranked = rankPanelSearchItems([item("1", "Casa"), item("2", "Café")], "CA");

    expect(ids(ranked)).toEqual(["2", "1"]);
  });

  test("breaks a label tie by id", () => {
    const ranked = rankPanelSearchItems([item("b", "Casa"), item("a", "Casa")], "ca");

    expect(ids(ranked)).toEqual(["a", "b"]);
  });

  test("returns an empty list unchanged", () => {
    expect(rankPanelSearchItems([], "ca")).toEqual([]);
  });
});
