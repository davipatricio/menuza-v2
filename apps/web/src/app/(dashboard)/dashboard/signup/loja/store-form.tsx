"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { ORPCError } from "@orpc/client";
import { Loader2 } from "lucide-react";
import { CreateStoreInputSchema } from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { createStore } from "@/lib/session-client.ts";
import { slugify } from "@/lib/slug.ts";
import { fieldErrors } from "../_components/form-errors.ts";

/**
 * Create-store step. The slug auto-fills from the name until the user edits it,
 * then stops following. Same Valibot rules the API enforces, including the
 * reserved-slug list.
 */
const CONFLICT_ERROR = "Este endereço já está em uso. Escolha outro.";

const GENERIC_ERROR = "Não foi possível criar a loja. Tente novamente.";

export function StoreForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm({
    defaultValues: {
      displayName: "",
      slug: "",
    },
    validators: {
      onSubmit: CreateStoreInputSchema,
      onBlur: CreateStoreInputSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      try {
        await createStore({ displayName: value.displayName, slug: value.slug });

        // The per-store panel is still the mock prototype (MEN-225 seed work),
        // so land on the picker, which lists the member's real stores.
        router.push("/dashboard");
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
        <form.Field name="displayName">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Nome da loja</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="organization"
                  placeholder="Padaria da Vila"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    const next = event.target.value;
                    field.handleChange(next);

                    if (!slugTouched) {
                      form.setFieldValue("slug", slugify(next));
                    }
                  }}
                  aria-invalid={isInvalid}
                />
                {isInvalid ? <FieldError errors={fieldErrors(field.state.meta.errors)} /> : null}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="slug">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Endereço da loja</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="off"
                  placeholder="padaria-da-vila"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    setSlugTouched(true);
                    field.handleChange(slugify(event.target.value));
                  }}
                  aria-invalid={isInvalid}
                />
                <FieldDescription>
                  É o endereço público da loja no Menuza. Use letras minúsculas, números e hífen.
                </FieldDescription>
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
            {isSubmitting ? "Criando loja…" : "Criar loja"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
