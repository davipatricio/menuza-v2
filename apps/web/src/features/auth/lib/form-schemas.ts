/**
 * Validation schemas and payload helpers for the auth forms. Pure: no React, no
 * DOM, so the rules can be unit-tested in plain Bun.
 */
import { ApiError } from "@/lib/api-error";
import {
  OnboardingPersonaSchema,
  OnboardingReferralSchema,
  OnboardingSegmentSchema,
  SaveOnboardingInputSchema,
} from "@menuza/shared/tenant";
import * as v from "valibot";

/**
 * Same rules as `LoginInputSchema`; this local copy exists only to carry pt-BR
 * messages, and `apps/web/tests/auth-forms.test.ts` pins the parity.
 */
export const LoginFormSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.check((value) => value.length > 0, "Informe seu e-mail."),
    v.check(
      (value) => value.length === 0 || v.safeParse(v.pipe(v.string(), v.email()), value).success,
      "Informe um e-mail válido.",
    ),
    v.maxLength(254, "E-mail muito longo."),
  ),
  password: v.pipe(
    v.string(),
    v.nonEmpty("Informe sua senha."),
    v.maxLength(200, "Senha muito longa."),
  ),
});

// eslint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses hand us `unknown`.
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
    return "E-mail ou senha incorretos.";
  }

  return "Não foi possível entrar. Tente novamente.";
}

export const OnboardingFormSchema = v.object({
  persona: v.nonOptional(v.optional(OnboardingPersonaSchema), "Escolha uma opção para continuar."),
  segment: v.optional(OnboardingSegmentSchema),
  referral: v.optional(OnboardingReferralSchema),
});

export function onboardingPayload(
  answers: v.InferOutput<typeof OnboardingFormSchema>,
  skipOptional: boolean,
): v.InferInput<typeof SaveOnboardingInputSchema> {
  if (skipOptional) {
    return { persona: answers.persona, segment: undefined, referral: undefined };
  }

  return {
    persona: answers.persona,
    segment: answers.segment,
    referral: answers.referral,
  };
}
