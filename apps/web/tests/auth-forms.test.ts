import { describe, expect, test } from "bun:test";
import { LoginInputSchema, SaveOnboardingInputSchema } from "@menuza/shared/tenant";
import * as v from "valibot";
import {
  LoginFormSchema,
  loginErrorMessage,
  OnboardingFormSchema,
  onboardingPayload,
} from "../src/features/auth/lib/form-schemas.ts";
import { ApiError } from "../src/lib/api-error.ts";

const PERSONAS = ["owner", "staff", "exploring", "partner"] as const;

const TOO_LONG_EMAIL = `${"a".repeat(244)}@menuza.com`;

const TOO_LONG_PASSWORD = "a".repeat(201);

const loginFixtures: Array<{ name: string; email: string; password: string }> = [
  { name: "valid", email: "ana@menuza.com", password: "segredo" },
  { name: "valid with surrounding spaces", email: "  ana@menuza.com  ", password: "segredo" },
  { name: "malformed email", email: "ana", password: "segredo" },
  { name: "empty email", email: "", password: "segredo" },
  { name: "empty password", email: "ana@menuza.com", password: "" },
  { name: "email too long", email: TOO_LONG_EMAIL, password: "segredo" },
  { name: "password too long", email: "ana@menuza.com", password: TOO_LONG_PASSWORD },
];

describe("LoginFormSchema", () => {
  test("accepts a valid pair and trims the email", () => {
    const result = v.parse(LoginFormSchema, {
      email: "  ana@menuza.com  ",
      password: "segredo",
    });

    expect(result.email).toBe("ana@menuza.com");
    expect(result.password).toBe("segredo");
  });

  test("rejects an empty or malformed email and an empty or oversized password", () => {
    const emptyEmail = v.safeParse(LoginFormSchema, { email: "", password: "x" });

    expect(emptyEmail.success).toBe(false);
    expect(emptyEmail.success ? [] : emptyEmail.issues.map((issue) => issue.message)).toEqual([
      "Informe seu e-mail.",
    ]);

    const malformedEmail = v.safeParse(LoginFormSchema, { email: "ana", password: "segredo" });

    expect(malformedEmail.success).toBe(false);
    expect(
      malformedEmail.success ? [] : malformedEmail.issues.map((issue) => issue.message),
    ).toContain("Informe um e-mail válido.");

    expect(v.safeParse(LoginFormSchema, { email: "ana@menuza.com", password: "" }).success).toBe(
      false,
    );
    expect(
      v.safeParse(LoginFormSchema, {
        email: TOO_LONG_EMAIL,
        password: "segredo",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(LoginFormSchema, {
        email: "ana@menuza.com",
        password: "a".repeat(201),
      }).success,
    ).toBe(false);

    const messages = (input: v.InferInput<typeof LoginFormSchema>) => {
      const result = v.safeParse(LoginFormSchema, input);

      return result.success ? [] : result.issues.map((issue) => issue.message);
    };

    expect(messages({ email: "ana@menuza.com", password: "" })).toContain("Informe sua senha.");
    expect(messages({ email: TOO_LONG_EMAIL, password: "segredo" })).toContain(
      "E-mail muito longo.",
    );
    expect(messages({ email: "ana@menuza.com", password: TOO_LONG_PASSWORD })).toContain(
      "Senha muito longa.",
    );
  });

  test("matches the shared LoginInputSchema on every fixture", () => {
    for (const fixture of loginFixtures) {
      const input = { email: fixture.email.trim(), password: fixture.password };

      expect({
        name: fixture.name,
        success: v.safeParse(LoginFormSchema, input).success,
      }).toEqual({
        name: fixture.name,
        success: v.safeParse(LoginInputSchema, input).success,
      });
    }
  });

  test("exposes a Standard Schema validator", () => {
    expect(LoginFormSchema["~standard"].validate).toBeInstanceOf(Function);
  });
});

describe("loginErrorMessage", () => {
  test("turns UNAUTHORIZED into the credential message", () => {
    expect(loginErrorMessage(new ApiError("UNAUTHORIZED"))).toBe("E-mail ou senha incorretos.");
  });

  test("turns any other failure into the generic message", () => {
    expect(loginErrorMessage(new ApiError("CONFLICT"))).toBe(
      "Não foi possível entrar. Tente novamente.",
    );
    expect(loginErrorMessage(new Error("x"))).toBe("Não foi possível entrar. Tente novamente.");
    expect(loginErrorMessage("boom")).toBe("Não foi possível entrar. Tente novamente.");
  });
});

describe("OnboardingFormSchema", () => {
  test("requires a persona and reports the pt-BR message on the persona path", () => {
    // A missing key is rejected by `v.object` itself; the form sends
    // `{ persona: undefined }`, which is where the local message applies.
    const missing = v.safeParse(OnboardingFormSchema, {});

    expect(missing.success).toBe(false);
    expect(missing.success ? [] : missing.issues.map((issue) => issue.path?.at(-1)?.key)).toEqual([
      "persona",
    ]);

    const undefinedPersona = v.safeParse(OnboardingFormSchema, { persona: undefined });

    expect(undefinedPersona.success).toBe(false);

    if (undefinedPersona.success) {
      throw new Error("expected the empty answers to fail");
    }

    expect(undefinedPersona.issues.map((issue) => issue.message)).toContain(
      "Escolha uma opção para continuar.",
    );
    expect(undefinedPersona.issues.some((issue) => issue.path?.at(-1)?.key === "persona")).toBe(
      true,
    );
  });

  test("accepts every persona with and without the optional answers", () => {
    for (const persona of PERSONAS) {
      expect(v.safeParse(OnboardingFormSchema, { persona }).success).toBe(true);
      expect(
        v.safeParse(OnboardingFormSchema, {
          persona,
          segment: "restaurant",
          referral: "instagram",
        }).success,
      ).toBe(true);
    }
  });

  test("rejects an unknown segment", () => {
    expect(v.safeParse(OnboardingFormSchema, { persona: "owner", segment: "bakery" }).success).toBe(
      false,
    );
  });
});

describe("onboardingPayload", () => {
  test("keeps all three answers when the optional questions are answered", () => {
    const answers = v.parse(OnboardingFormSchema, {
      persona: "owner",
      segment: "restaurant",
      referral: "instagram",
    });

    const payload = onboardingPayload(answers, false);

    expect(payload).toEqual({
      persona: "owner",
      segment: "restaurant",
      referral: "instagram",
    });
    expect(v.safeParse(SaveOnboardingInputSchema, payload).success).toBe(true);
  });

  test("drops the optional answers to undefined when they are skipped", () => {
    const answers = v.parse(OnboardingFormSchema, {
      persona: "owner",
      segment: "restaurant",
      referral: "instagram",
    });

    const payload = onboardingPayload(answers, true);

    expect(payload).toEqual({ persona: "owner", segment: undefined, referral: undefined });
    expect("segment" in payload).toBe(true);
    expect("referral" in payload).toBe(true);
    expect(v.safeParse(SaveOnboardingInputSchema, payload).success).toBe(true);
  });
});
