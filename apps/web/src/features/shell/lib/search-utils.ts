/**
 * Pure helpers behind the dashboard quick-nav palette: filtering, index
 * clamping and keyboard moves. No React, no router — unit-testable as-is.
 */

export interface PageSearchItem {
  kind: "page";
  id: string;
  label: string;
  href: string;
  section?: string;
}

export type MoveKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Lowercase, diacritic-free form used for every comparison. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function searchPages(items: PageSearchItem[], query: string): PageSearchItem[] {
  const needle = fold(query.trim());

  if (needle === "") return items;

  return items.filter((item) => fold(item.label).includes(needle));
}

export function clampIndex(length: number, index: number): number {
  if (length <= 0) return -1;

  if (index < 0) return 0;

  if (index > length - 1) return length - 1;

  return index;
}

export function moveIndex(length: number, current: number, key: MoveKey): number {
  if (length <= 0) return -1;

  const index = clampIndex(length, current);

  switch (key) {
    case "ArrowDown":
      return (index + 1) % length;
    case "ArrowUp":
      return index === 0 ? length - 1 : index - 1;
    case "Home":
      return 0;
    case "End":
      return length - 1;
  }
}
