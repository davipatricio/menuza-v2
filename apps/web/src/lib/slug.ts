const MAX_SLUG_LENGTH = 24;

/**
 * Derives a store slug from a display name: strips accents, lowercases, and
 * replaces anything non-alphanumeric with a single hyphen (no edge hyphens).
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}
