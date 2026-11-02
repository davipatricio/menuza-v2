/**
 * Narrows TanStack Form's field errors to the shape `FieldError` renders.
 *
 * Every validator in the signup forms is a Valibot Standard Schema, so each
 * entry is an issue object carrying a string `message`; no custom string
 * validators are used.
 */
export function fieldErrors(errors: ReadonlyArray<unknown>): Array<{ message?: string }> {
  // SAFETY: Standard Schema issues all expose a string `message`, which is the
  // exact contract `FieldError` accepts.
  return errors as Array<{ message?: string }>;
}
