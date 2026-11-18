/**
 * The one place the dashboard turns typed reais into integer cents.
 *
 * Values are integers everywhere past this edge (ADR-0006), so the parser is
 * strict about the pt-BR shape: a thousands dot only every three digits, an
 * optional comma or dot with one or two decimals, and nothing else reaches the
 * API.
 */
const BRL_INPUT = /^(?:(\d{1,3}(?:\.\d{3})+)|(\d+))(?:[.,](\d{1,2}))?$/;

/** The contract stores cents as an `i32`; anything past it is a typo, not a price. */
const MAX_CENTS = 2_147_483_647;

export type BrlInput = { ok: true; cents: number | null } | { ok: false };

/** `{ ok: true, cents: null }` is an empty field; `{ ok: false }` is text outside the format. */
export function parseBrlInput(text: string): BrlInput {
  const trimmed = text.trim();

  if (trimmed === "") return { ok: true, cents: null };

  const match = BRL_INPUT.exec(trimmed);

  if (!match) return { ok: false };

  const reais = (match[1] ?? match[2] ?? "").replaceAll(".", "");
  const centavos = (match[3] ?? "").padEnd(2, "0");
  const cents = Number(reais) * 100 + Number(centavos);

  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { ok: false };

  return { ok: true, cents };
}

/** Cents as the editable pt-BR string: `1550` becomes `"15,50"`. */
export function brlInput(cents: number | null): string {
  if (cents === null) return "";

  return (cents / 100).toFixed(2).replace(".", ",");
}
