import { useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { Loader2 } from "lucide-react";
import type { Onboarding } from "@menuza/shared/tenant";
import { cn } from "cn";
import { Button } from "@/components/ui/button.tsx";
import { saveOnboarding } from "@/features/auth/server/session-client.ts";
import { OnboardingFormSchema, onboardingPayload } from "../../lib/form-schemas.ts";

type Persona = Onboarding["persona"];

type Segment = NonNullable<Onboarding["segment"]>;

type Referral = NonNullable<Onboarding["referral"]>;

const PERSONAS: ReadonlyArray<{ value: Persona; label: string }> = [
  { value: "owner", label: "Dono(a) de loja" },
  { value: "staff", label: "Funcionário(a)" },
  { value: "exploring", label: "Só explorando" },
  { value: "partner", label: "Parceiro(a) ou agência" },
];

const SEGMENTS: ReadonlyArray<{ value: Segment; label: string }> = [
  { value: "restaurant", label: "Restaurante" },
  { value: "snack", label: "Lanchonete" },
  { value: "market", label: "Mercado" },
  { value: "sweets", label: "Doceria" },
  { value: "other", label: "Outro" },
];

const REFERRALS: ReadonlyArray<{ value: Referral; label: string }> = [
  { value: "referral", label: "Indicação" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "other", label: "Outro" },
];

function OptionGroup<T extends string>({
  name,
  legend,
  optional,
  value,
  onChange,
  options,
}: {
  name: string;
  legend: string;
  optional?: boolean;
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        {legend}
        {optional ? (
          <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </legend>
      <div className="grid gap-2">
        {options.map((option) => {
          const checked = value === option.value;

          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  checked ? "border-primary" : "border-border",
                )}
              >
                {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              <span className="font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const SAVE_ERROR = "Não foi possível salvar suas respostas. Tente novamente.";

const PERSONA_REQUIRED = "Escolha uma opção para continuar.";

/**
 * Onboarding questions. `persona` is required; the other two are optional and
 * can be skipped. Reopening the step pre-fills the saved answers and updates
 * them (the server upserts). Skipping sends only the persona.
 */
export function OnboardingForm({ initial }: { initial: Onboarding | null }) {
  const navigate = useNavigate();
  const router = useRouter();
  // The ghost button has no field to validate, so it records its intent here
  // and submits the same form; `onSubmit` reads and resets the flag, which keeps
  // one `isSubmitting` and one server-error banner for both buttons.
  const skipOptionalRef = useRef(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const initialAnswers: Partial<v.InferInput<typeof OnboardingFormSchema>> = {
    persona: initial?.persona ?? undefined,
    segment: initial?.segment ?? undefined,
    referral: initial?.referral ?? undefined,
  };

  const form = useForm({
    defaultValues: initialAnswers,
    validators: {
      onSubmit: OnboardingFormSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      const answers = v.parse(OnboardingFormSchema, value);
      const skipOptional = skipOptionalRef.current;
      skipOptionalRef.current = false;

      try {
        await saveOnboarding(onboardingPayload(answers, skipOptional));

        await router.invalidate();
        void navigate({ to: "/dashboard/signup/escolha" });
      } catch {
        setServerError(SAVE_ERROR);
      }
    },
  });

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-6">
        <form.Field name="persona">
          {(field) => (
            <OptionGroup
              name="persona"
              legend="Qual é o seu perfil?"
              value={field.state.value ?? null}
              onChange={(next) => field.handleChange(next)}
              options={PERSONAS}
            />
          )}
        </form.Field>
        <form.Field name="segment">
          {(field) => (
            <OptionGroup
              name="segment"
              legend="Que tipo de negócio?"
              optional
              value={field.state.value ?? null}
              onChange={(next) => field.handleChange(next)}
              options={SEGMENTS}
            />
          )}
        </form.Field>
        <form.Field name="referral">
          {(field) => (
            <OptionGroup
              name="referral"
              legend="Como conheceu o Menuza?"
              optional
              value={field.state.value ?? null}
              onChange={(next) => field.handleChange(next)}
              options={REFERRALS}
            />
          )}
        </form.Field>
      </div>

      {serverError ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <form.Subscribe selector={(state) => state.fieldMeta.persona}>
        {(meta) =>
          meta?.isTouched && !meta.isValid ? (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {PERSONA_REQUIRED}
            </p>
          ) : null
        }
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="mt-6 flex flex-col gap-2">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
              ) : null}
              {isSubmitting ? "Salvando…" : "Continuar"}
            </Button>
            <form.Subscribe selector={(state) => state.values.persona !== undefined}>
              {(hasPersona) =>
                hasPersona ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    className="w-full"
                    onClick={() => {
                      skipOptionalRef.current = true;
                      void form.handleSubmit();
                    }}
                  >
                    Pular perguntas opcionais
                  </Button>
                ) : null
              }
            </form.Subscribe>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
