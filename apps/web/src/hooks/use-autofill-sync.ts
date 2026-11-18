import { useEffect, useRef } from "react";
import type { RefObject } from "react";

function isTextControl(control: Element): control is HTMLInputElement | HTMLTextAreaElement {
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement;
}

/**
 * Replays pre-hydration DOM values into a form's own state.
 *
 * Browsers and password managers fill a form while its server HTML is already
 * interactive but React has not hydrated yet, so the text exists only in the
 * DOM: the form state still holds the empty defaults. The first re-render then
 * writes those defaults back over the control, and the autofilled credentials
 * disappear from the screen. Copy every filled control into the form state once,
 * after mount, so what the user sees is what the form will submit.
 */
export function useAutofillSync(
  formRef: RefObject<HTMLFormElement | null>,
  apply: (values: { name: string; value: string }) => void,
) {
  const applied = useRef(false);

  useEffect(() => {
    const form = formRef.current;

    if (applied.current || !form) return;

    applied.current = true;

    for (const control of Array.from(form.elements)) {
      if (!isTextControl(control)) continue;

      const { name, value, defaultValue } = control;

      // A control nobody filled still holds its rendered value; only a differing
      // one came from autofill or from typing before hydration.
      if (!name || value === "" || value === defaultValue) continue;

      apply({ name, value });
    }
  }, [apply, formRef]);
}
