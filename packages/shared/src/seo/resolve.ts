import { applySeoTokens } from "./tokens.ts";
import type { ResolvedSeo, SeoContext, SeoMetaRow, SeoSource, StoreSeoDefaults } from "./types.ts";

interface SeoLevel {
  value: string | null;
  source: SeoSource;
}

/** A blank string is "not set" at every level — a token-only template can resolve empty. */
function textOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : value;
}

function firstSet(levels: SeoLevel[], fallback: SeoLevel): SeoLevel {
  return levels.find((level) => level.value !== null) ?? fallback;
}

/**
 * Resolves the SEO fields a page renders, per field, entity → store row →
 * settings template → static fallback. `canonicalUrl` and `jsonLd` are
 * entity-only: a canonical URL or structured-data block inherited from the store
 * would describe a different page.
 *
 * `source` collapses the settings template into `"store"`: it is store-level
 * configuration, and the UI only distinguishes "this entity", "the store" and
 * "the static default". A template that resolves to an empty string (e.g. only
 * `%city%` with no city) falls through to the fallback.
 *
 * Pure: no I/O, no clock, no env.
 */
export function resolveSeo(input: {
  entity: SeoMetaRow | null;
  storeRow: SeoMetaRow | null;
  settings: StoreSeoDefaults | null;
  context: SeoContext;
  fallbackTitle: string;
  fallbackDescription?: string | null;
}): ResolvedSeo {
  const { entity, storeRow, settings, context, fallbackTitle, fallbackDescription } = input;

  const settingsTitle =
    settings?.seoTitleTemplate == null
      ? null
      : textOrNull(applySeoTokens(settings.seoTitleTemplate, context));

  const settingsDescription =
    settings?.seoDescriptionTemplate == null
      ? null
      : textOrNull(applySeoTokens(settings.seoDescriptionTemplate, context));

  const titleLevel = firstSet(
    [
      { value: textOrNull(entity?.title), source: "entity" },
      { value: textOrNull(storeRow?.title), source: "store" },
      { value: settingsTitle, source: "store" },
    ],
    { value: fallbackTitle, source: "default" },
  );

  const descriptionLevel = firstSet(
    [
      { value: textOrNull(entity?.description), source: "entity" },
      { value: textOrNull(storeRow?.description), source: "store" },
      { value: settingsDescription, source: "store" },
    ],
    { value: textOrNull(fallbackDescription), source: "default" },
  );

  const socialImageLevel = firstSet(
    [
      { value: textOrNull(entity?.socialImageUrl), source: "entity" },
      { value: textOrNull(storeRow?.socialImageUrl), source: "store" },
      { value: textOrNull(settings?.seoSocialImageUrl), source: "store" },
    ],
    { value: null, source: "default" },
  );

  return {
    title: titleLevel.value ?? fallbackTitle,
    description: descriptionLevel.value,
    canonicalUrl: textOrNull(entity?.canonicalUrl),
    socialImageUrl: socialImageLevel.value,
    jsonLd: textOrNull(entity?.jsonLd),
    source: {
      title: titleLevel.source,
      description: descriptionLevel.source,
      socialImageUrl: socialImageLevel.source,
    },
  };
}
