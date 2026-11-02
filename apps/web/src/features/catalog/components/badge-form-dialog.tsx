import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import type { BadgeRow } from "@/features/catalog/lib/taxonomy-types.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const IMAGE_URL = /^https?:\/\/.+/i;

/**
 * Create/edit form for a store badge. Badges are the one taxonomy row with an
 * image, so they do not fit the shared `TaxonomyFormDialog`.
 */
export function BadgeFormDialog({
  storeSlug,
  row,
  onClose,
}: {
  storeSlug: string;
  row?: BadgeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [name, setName] = useState(row?.name ?? "");
  const [imageUrl, setImageUrl] = useState(row?.imageUrl ?? "");
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? 0));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = name.trim() === "" ? "Informe o nome da etiqueta." : undefined;

  const imageError = IMAGE_URL.test(imageUrl.trim())
    ? undefined
    : "Informe uma URL http(s) da imagem.";

  const orderError = /^\d+$/.test(sortOrder)
    ? undefined
    : "Use um número inteiro maior ou igual a zero.";

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        storeSlug,
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        sortOrder: Number(sortOrder),
      };

      return row
        ? client().panel.updateBadge({ ...input, badgeId: row.id })
        : client().panel.createBadge(input);
    },
    onSuccess: () => {
      void router.invalidate();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ORPCError && error.code === "CONFLICT") {
        setServerError(error.message);

        return;
      }

      setServerError("Não foi possível salvar a etiqueta. Tente novamente.");
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          <DialogDescription>
            A etiqueta aparece nos produtos da loja junto da imagem informada.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            setServerError(null);

            if (nameError || imageError || orderError) return;

            mutation.mutate();
          }}
        >
          <Field data-invalid={(submitted && Boolean(nameError)) || undefined}>
            <FieldLabel htmlFor={`${fieldId}-name`}>Nome</FieldLabel>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={(submitted && Boolean(nameError)) || undefined}
              placeholder="Ex.: Mais vendido"
            />
            {submitted && nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>

          <Field data-invalid={(submitted && Boolean(imageError)) || undefined}>
            <FieldLabel htmlFor={`${fieldId}-image`}>URL da imagem</FieldLabel>
            <Input
              id={`${fieldId}-image`}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              aria-invalid={(submitted && Boolean(imageError)) || undefined}
              placeholder="https://…/etiqueta.png"
            />
            {submitted && imageError ? <FieldError>{imageError}</FieldError> : null}
          </Field>

          <Field data-invalid={(submitted && Boolean(orderError)) || undefined}>
            <FieldLabel htmlFor={`${fieldId}-order`}>Ordem</FieldLabel>
            <Input
              id={`${fieldId}-order`}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              inputMode="numeric"
              aria-invalid={(submitted && Boolean(orderError)) || undefined}
            />
            {submitted && orderError ? <FieldError>{orderError}</FieldError> : null}
          </Field>

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner /> : null}
              {row ? "Salvar" : "Criar etiqueta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
