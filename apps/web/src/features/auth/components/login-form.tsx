import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { loginSession } from "@/features/auth/server/session-client.ts";
import { fieldErrors } from "@/lib/form-errors.ts";
import { safeReturnTo } from "@/lib/return-to.ts";
import { LoginFormSchema, loginErrorMessage } from "../lib/form-schemas.ts";

/**
 * Staff login form. Posts to `session.login` on the same-origin tenant API; the
 * API's `Set-Cookie` lands on this origin, so the navigation that follows
 * already carries the new session.
 */
export function LoginForm({ returnTo }: { returnTo?: string | string[] }) {
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: LoginFormSchema,
      onBlur: LoginFormSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      try {
        await loginSession({ email: value.email.trim(), password: value.password });

        // Typed routes cannot express a runtime path, so the destination is a document navigation.
        window.location.assign(safeReturnTo(returnTo));
      } catch (error) {
        setServerError(loginErrorMessage(error));
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <form
          method="post"
          noValidate
          aria-busy={isSubmitting}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-5"
        >
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
                    required
                    value={field.state.value}
                    disabled={isSubmitting}
                    aria-invalid={isInvalid || Boolean(serverError)}
                    aria-describedby={serverError ? "login-error" : undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
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
                    autoComplete="current-password"
                    required
                    value={field.state.value}
                    disabled={isSubmitting}
                    aria-invalid={isInvalid || Boolean(serverError)}
                    aria-describedby={serverError ? "login-error" : undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {isInvalid ? <FieldError errors={fieldErrors(field.state.meta.errors)} /> : null}
                </Field>
              );
            }}
          </form.Field>

          {serverError ? (
            <p
              id="login-error"
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
            ) : null}
            {isSubmitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      )}
    </form.Subscribe>
  );
}
