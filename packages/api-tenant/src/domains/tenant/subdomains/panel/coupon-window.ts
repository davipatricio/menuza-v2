/**
 * The coupon validity window, interpreted as whole days.
 *
 * The dashboard edits dates with a day picker (no time of day), so the window
 * is a pair of calendar days and the server is what turns them into instants.
 * Doing it here — not in the form — is what keeps the meaning in one place:
 * a coupon ending "31/10" runs through the end of 31/10, and one starting
 * "01/10" is valid from the start of 01/10.
 *
 * An input that already carries a time is taken at its word; only a bare date
 * is widened to the day boundary.
 */
import { validationFailed } from "./paymentSupport.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | null | undefined): Temporal.PlainDateTime | null {
  if (value == null || value === "") return null;

  return Temporal.PlainDateTime.from(value);
}

/** Start of the day the user picked. */
export function startOfCouponWindow(
  value: string | null | undefined,
): Temporal.PlainDateTime | null {
  const parsed = parse(value);

  if (parsed === null) return null;

  return DATE_ONLY.test(value ?? "")
    ? parsed.with({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    : parsed;
}

/** End of the day the user picked, so the last chosen day is still usable. */
export function endOfCouponWindow(value: string | null | undefined): Temporal.PlainDateTime | null {
  const parsed = parse(value);

  if (parsed === null) return null;

  return DATE_ONLY.test(value ?? "")
    ? parsed.with({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    : parsed;
}

/**
 * Both ends, refusing a window that opens after it closes.
 *
 * The form validates the same rule, but the form is not the server: a coupon
 * that opens after it closes used to be saved with `startsAt` silently moved
 * to `endsAt`, so the stored window was not the one on screen.
 */
export function couponWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  const start = startOfCouponWindow(startsAt);
  const end = endOfCouponWindow(endsAt);

  if (start !== null && end !== null && Temporal.PlainDateTime.compare(start, end) > 0) {
    throw validationFailed("A data de início não pode ser posterior à data de término.");
  }

  return { startsAt: start, endsAt: end };
}
