const DEFAULT_TARGET = "/dashboard";

/**
 * Sanitizes a `returnTo` query value before navigating. Only same-origin
 * absolute paths are accepted, so a crafted `?returnTo=https://evil.example`
 * (or `//evil.example`) cannot turn login or OAuth consent into an open redirect.
 *
 * Backslashes are rejected outright: URL parsers normalize `\` to `/`, so
 * `/\evil.example` clears both the leading-slash and double-slash checks and
 * still resolves off-site. Any other control character is refused for the same
 * reason — a path the router would read differently than this check does is not
 * a path worth following.
 */
export function safeReturnTo(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_TARGET;

  // Backslash plus every C0 control and DEL, written as code points so the
  // check itself carries no raw control characters.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (char === "\\" || code < 0x20 || code === 0x7f) return DEFAULT_TARGET;
  }

  return value;
}
