"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Onboarding } from "@menuza/shared/tenant";
import { cn } from "cn";
import { Button } from "@/components/ui/button.tsx";
import { saveOnboarding } from "@/lib/session-client.ts";

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
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(initial?.persona ?? null);
  const [segment, setSegment] = useState<Segment | null>(initial?.segment ?? null);
  const [referral, setReferral] = useState<Referral | null>(initial?.referral ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(skipOptional: boolean) {
    if (!persona) {
      setError(PERSONA_REQUIRED);

      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await saveOnboarding({
        persona,
        segment: skipOptional ? undefined : (segment ?? undefined),
        referral: skipOptional ? undefined : (referral ?? undefined),
      });

      router.push("/dashboard/signup/escolha");
      router.refresh();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void submit(false);
      }}
    >
      <div className="flex flex-col gap-6">
        <OptionGroup
          name="persona"
          legend="Qual é o seu perfil?"
          value={persona}
          onChange={setPersona}
          options={PERSONAS}
        />
        <OptionGroup
          name="segment"
          legend="Que tipo de negócio?"
          optional
          value={segment}
          onChange={setSegment}
          options={SEGMENTS}
        />
        <OptionGroup
          name="referral"
          legend="Como conheceu o Menuza?"
          optional
          value={referral}
          onChange={setReferral}
          options={REFERRALS}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
          ) : null}
          {submitting ? "Salvando…" : "Continuar"}
        </Button>
        {persona ? (
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            className="w-full"
            onClick={() => void submit(true)}
          >
            Pular perguntas opcionais
          </Button>
        ) : null}
      </div>
    </form>
  );
}
