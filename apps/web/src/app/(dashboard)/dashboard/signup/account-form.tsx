"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { ORPCError } from "@orpc/client";
import { Loader2 } from "lucide-react";
import {
  RegisterBirthdateSchema,
  RegisterEmailSchema,
  RegisterNameSchema,
  RegisterPasswordSchema,
} from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { registerAccount } from "@/lib/session-client.ts";
import { DatePicker } from "./_components/date-picker.tsx";
import { fieldErrors } from "./_components/form-errors.ts";

/**
 * Account step. Reuses the server's per-field Valibot schemas (the same rules
 * the API enforces) plus a client-only password confirmation. On success the
 * API has already set the session cookie, so the wizard's next routes are
 * authenticated.
 */
const SignupFormSchema = v.pipe(
  v.object({
    name: RegisterNameSchema,
    email: RegisterEmailSchema,
    birthdate: RegisterBirthdateSchema,
    password: RegisterPasswordSchema,
    confirmPassword: v.pipe(v.string(), v.nonEmpty("Confirme a senha.")),
  }),
  v.forward(
    v.check((input) => input.password === input.confirmPassword, "As senhas não conferem."),
    ["confirmPassword"],
  ),
);

const CONFLICT_ERROR = "Não foi possível criar a conta com esses dados.";

const GENERIC_ERROR = "Não foi possível criar a conta. Tente novamente.";

export function AccountForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      birthdate: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: SignupFormSchema,
      onBlur: SignupFormSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      try {
        await registerAccount({
          name: value.name,
          email: value.email,
          birthdate: value.birthdate,
          password: value.password,
        });

        router.push("/dashboard/signup/perfil");
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof ORPCError && error.code === "CONFLICT" ? CONFLICT_ERROR : GENERIC_ERROR,
        );
      }
    },
  });

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
        <form.Field name="name">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Nome</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="name"
                  placeholder="Como devemos te chamar"
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

        <form.Field name="email">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>E-mail</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
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

        <form.Field name="birthdate">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Data de nascimento</FieldLabel>
                <DatePicker
                  id={field.name}
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  onBlur={field.handleBlur}
                  invalid={isInvalid}
                />
                {isInvalid ? <FieldError errors={fieldErrors(field.state.meta.errors)} /> : null}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Senha</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ao menos 8 caracteres"
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

        <form.Field name="confirmPassword">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Confirmar senha</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
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

      {serverError ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting} className="mt-6 w-full">
            {isSubmitting ? (
              <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
            ) : null}
            {isSubmitting ? "Criando conta…" : "Criar conta"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
