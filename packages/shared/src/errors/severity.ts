/** Codes treated as 4xx (client errors) — log only, no Sentry exception. */
export const FOUR_XX_CODES = [
  "TENANT_NOT_RESOLVED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
] as const;

export type FourXxCode = (typeof FOUR_XX_CODES)[number];

const FOUR_XX_SET: ReadonlySet<string> = new Set(FOUR_XX_CODES);

export function isFourXxCode(code: unknown): code is FourXxCode {
  return FOUR_XX_SET.has(String(code));
}
