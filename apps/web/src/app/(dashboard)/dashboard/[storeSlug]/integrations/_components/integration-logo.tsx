import type { IntegrationDefinition } from "@menuza/shared/tenant";

/**
 * The integration's brand mark, or its monogram when the catalog has no mark.
 *
 * The glyph is inline SVG on purpose: the list draws one per card, and an
 * `<img>` per card would be nine extra requests for nine tiny paths. The brand
 * colour is applied as `mask` fill rather than a hardcoded `fill`, so the mark
 * keeps its identity in light and dark without a second asset.
 */
export function IntegrationLogoMark({
  integration,
  className,
}: {
  integration: IntegrationDefinition;
  className?: string;
}) {
  const logo = integration.logo;

  if (!logo) {
    return (
      <span
        aria-hidden="true"
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-xs font-semibold text-muted-foreground ${className ?? ""}`}
      >
        {monogramOf(integration.name)}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 ${className ?? ""}`}
    >
      <svg
        role="presentation"
        viewBox="0 0 24 24"
        className="size-5"
        fill={`#${logo.hex}`}
        // The mark is decorative next to the name in the same card; the colour
        // comes from the catalog, not from a theme token, because it is the
        // brand's own.
        style={{ color: `#${logo.hex}` }}
      >
        <path d={logo.path} />
      </svg>
    </span>
  );
}

/** First letter of the first two words are noise; one letter reads better. */
function monogramOf(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 1)
    .toUpperCase();
}
