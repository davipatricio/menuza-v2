/**
 * The ranking half of `panel.search`, kept out of the handler so it can be
 * tested without a database.
 *
 * Matching is already done by `ILIKE` in Postgres; this only decides the order
 * of the few rows that came back. Prefix matches first, then a pt-BR
 * alphabetical order, then the id. Accent folding is deliberately not done:
 * `ILIKE` does not fold accents either, so the ranking would disagree with the
 * filter.
 */
import type { PanelSearchItem } from "@menuza/shared/tenant";

/** Normalizes once per comparison; `pt-BR` is the dashboard's language. */
function normalized(value: string): string {
  return value.toLocaleLowerCase("pt-BR");
}

export function rankPanelSearchItems(
  items: readonly PanelSearchItem[],
  q: string,
): PanelSearchItem[] {
  const term = normalized(q);

  const prefixRank = (item: PanelSearchItem): number =>
    normalized(item.label).startsWith(term) ? 0 : 1;

  return [...items].sort(
    (left, right) =>
      prefixRank(left) - prefixRank(right) ||
      left.label.localeCompare(right.label, "pt-BR") ||
      left.id.localeCompare(right.id),
  );
}
