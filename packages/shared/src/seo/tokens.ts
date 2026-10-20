import type { SeoContext } from "./types.ts";

const SEO_TOKEN = /%(store|entity|city)%/;

/**
 * Substitutes `%store%`, `%entity%` and `%city%` (case-sensitive, literal) in a
 * store-level template. Unknown `%...%` sequences and templates without a known
 * token come back untouched; `%city%` without a city resolves to nothing rather
 * than the raw token or `"undefined"`.
 *
 * ponytail: whitespace is collapsed everywhere once a token is present, so a
 * template's own double spaces go too. Narrow it to the substitution seams when
 * templates start carrying meaningful interior spacing.
 */
export function applySeoTokens(template: string, context: SeoContext): string {
  if (!SEO_TOKEN.test(template)) return template;

  return template
    .replaceAll("%store%", context.storeName)
    .replaceAll("%entity%", context.entityName)
    .replaceAll("%city%", context.city ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
