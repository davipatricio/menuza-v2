"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { ArrowRight, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { fieldErrors } from "../_components/form-errors.ts";

/**
 * Invite step — a navigable stub. Invite redemption needs a first-class invite
 * model that does not exist yet, so this validates the code's shape and tells
 * the user it is coming, offering the create-store path instead.
 */
const InviteSchema = v.object({
  code: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Informe o código do convite."),
    v.regex(/^[A-Za-z0-9-]{6,20}$/, "O código deve ter de 6 a 20 caracteres."),
  ),
});

export function InviteForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm({
    defaultValues: {
      code: "",
    },
    validators: {
      onSubmit: InviteSchema,
      onBlur: InviteSchema,
    },
    onSubmit: () => {
      setSubmitted(true);
    },
  });

  if (submitted) {
    return (
      <output
        aria-live="polite"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-sm"
      >
        <span className="flex items-center gap-2 font-medium">
          <MailCheck aria-hidden="true" className="size-4" />
          Resgate de convites em breve
        </span>
        <p className="text-pretty text-muted-foreground">
          Ainda estamos preparando o resgate de convites. Enquanto isso, você pode criar a sua
          própria loja agora.
        </p>
        <Button render={<Link href="/dashboard/signup/loja" aria-label="Criar uma loja" />}>
          Criar uma loja
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </output>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-5">
        <form.Field name="code">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Código do convite</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="ABC123"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid ? <FieldError errors={fieldErrors(field.state.meta.errors)} /> : null}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      <Button type="submit" className="mt-6 w-full">
        Usar convite
      </Button>
    </form>
  );
}
