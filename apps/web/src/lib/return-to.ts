const DEFAULT_TARGET = "/dashboard";

/**
 * Sanitizes a `returnTo` query value before navigating. Only same-origin
 * absolute paths are accepted, so a crafted `?returnTo=https://evil.example`
 * (or `//evil.example`) cannot turn login or OAuth consent into an open redirect.
 */
export function safeReturnTo(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_TARGET;

  return value;
}
