"use client";

import type { FormEvent } from "react";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";
import { useMutation } from "@tanstack/react-query";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

export type TaxonomyEntity = "category" | "department" | "tag";

export type TaxonomyRow = { id: string; name: string };

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

type TaxonomyWriteInput = { storeSlug: string; name: string; sortOrder: number };

/** One label set per entity, so the three screens stay copy-identical. */
const TAXONOMY: Record<
  TaxonomyEntity,
  {
    singular: string;
    createDialog: string;
    editDialog: string;
    duplicate: string;
    inUse: string;
    notFound: string;
  }
> = {
  category: {
    singular: "categoria",
    createDialog: "Nova categoria",
    editDialog: "Editar categoria",
    duplicate: "Já existe uma categoria com esse nome.",
    inUse: "Esta categoria ainda tem produtos. Mova os produtos antes de excluí-la.",
    notFound: "Categoria não encontrada nesta loja.",
  },
  department: {
    singular: "departamento",
    createDialog: "Novo departamento",
    editDialog: "Editar departamento",
    duplicate: "Já existe um departamento com esse nome.",
    inUse: "Este departamento ainda tem produtos. Mova os produtos antes de excluí-lo.",
    notFound: "Departamento não encontrado nesta loja.",
  },
  tag: {
    singular: "tag",
    createDialog: "Nova tag",
    editDialog: "Editar tag",
    duplicate: "Já existe uma tag com esse nome.",
    inUse: "Esta tag ainda está em produtos. Remova a tag dos produtos antes de excluí-la.",
    notFound: "Tag não encontrada nesta loja.",
  },
};

async function createEntity(entity: TaxonomyEntity, input: TaxonomyWriteInput) {
  const panel = client().panel;

  switch (entity) {
    case "category":
      return panel.createCategory(input);
    case "department":
      return panel.createDepartment(input);
    case "tag":
      return panel.createTag(input);
  }
}

async function updateEntity(entity: TaxonomyEntity, id: string, input: TaxonomyWriteInput) {
  const panel = client().panel;

  switch (entity) {
    case "category":
      return panel.updateCategory({ ...input, categoryId: id });
    case "department":
      return panel.updateDepartment({ ...input, departmentId: id });
    case "tag":
      return panel.updateTag({ ...input, tagId: id });
  }
}

async function deleteEntity(entity: TaxonomyEntity, storeSlug: string, id: string) {
  const panel = client().panel;

  switch (entity) {
    case "category":
      return panel.deleteCategory({ storeSlug, categoryId: id });
    case "department":
      return panel.deleteDepartment({ storeSlug, departmentId: id });
    case "tag":
      return panel.deleteTag({ storeSlug, tagId: id });
  }
}

function serverMessage(error: Error, entity: TaxonomyEntity, action: "save" | "delete"): string {
  if (error instanceof ORPCError) {
    const labels = TAXONOMY[entity];

    if (error.code === "CONFLICT") return action === "delete" ? labels.inUse : labels.duplicate;

    if (error.code === "FORBIDDEN")
      return "Você não tem permissão para editar o catálogo desta loja.";

    if (error.code === "NOT_FOUND") return labels.notFound;
  }

  return action === "delete"
    ? "Não foi possível excluir. Tente novamente."
    : "Não foi possível salvar. Tente novamente.";
}

const NAME_MAX = 80;

function validate(name: string, sortOrder: string) {
  const trimmed = name.trim();
  const order = Number(sortOrder);
  const emptyOrder = sortOrder.trim() === "";

  return {
    name: !trimmed
      ? "Informe o nome."
      : trimmed.length > NAME_MAX
        ? "Use no máximo 80 caracteres."
        : undefined,
    sortOrder: emptyOrder
      ? "Informe uma ordem válida."
      : !Number.isInteger(order)
        ? "Use um número inteiro."
        : order < 0
          ? "O valor mínimo é 0."
          : undefined,
  };
}

/** Create and edit share one form dialog; `row` absent means create. */
function TaxonomyFormDialog({
  entity,
  storeSlug,
  row,
  sortOrder,
  onClose,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  row?: TaxonomyRow;
  sortOrder: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const [name, setName] = useState(row?.name ?? "");
  const [order, setOrder] = useState(String(sortOrder));
  const [touched, setTouched] = useState({ name: false, sortOrder: false });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validate(name, order);

  const invalid = (field: "name" | "sortOrder") =>
    (touched[field] || submitted) && Boolean(errors[field]);

  const mutation = useMutation({
    mutationFn: (input: TaxonomyWriteInput) =>
      row ? updateEntity(entity, row.id, input) : createEntity(entity, input),
    onSuccess: () => {
      router.refresh();
      onClose();
    },
    onError: (error) => setServerError(serverMessage(error, entity, "save")),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    if (errors.name || errors.sortOrder) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });

      return;
    }

    mutation.mutate({ storeSlug, name: name.trim(), sortOrder: Number(order) });
  };

  const error = (field: "name" | "sortOrder") =>
    invalid(field) ? (
      <FieldError id={`${fieldId}-${field}-error`}>{errors[field]}</FieldError>
    ) : null;

  const describedBy = (field: "name" | "sortOrder") =>
    invalid(field) ? `${fieldId}-${field}-error` : undefined;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {row ? TAXONOMY[entity].editDialog : TAXONOMY[entity].createDialog}
          </DialogTitle>
          <DialogDescription>
            {row ? "Altere o nome ou a posição na lista." : "Nome e posição na lista do catálogo."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor={`${fieldId}-name`}>Nome</FieldLabel>
              <Input
                id={`${fieldId}-name`}
                value={name}
                maxLength={NAME_MAX}
                autoComplete="off"
                aria-invalid={invalid("name")}
                aria-describedby={describedBy("name")}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
              />
              {error("name")}
            </Field>

            <Field data-invalid={invalid("sortOrder")}>
              <FieldLabel htmlFor={`${fieldId}-sort`}>Ordem</FieldLabel>
              <Input
                id={`${fieldId}-sort`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={order}
                aria-invalid={invalid("sortOrder")}
                aria-describedby={
                  invalid("sortOrder") ? `${fieldId}-sort-error` : `${fieldId}-sort-description`
                }
                onChange={(event) => setOrder(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, sortOrder: true }))}
              />
              <FieldDescription id={`${fieldId}-sort-description`}>
                Menor aparece primeiro.
              </FieldDescription>
              {error("sortOrder")}
            </Field>
          </FieldGroup>

          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível salvar</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {row ? "Salvar alterações" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The toolbar button that opens an empty form. */
export function TaxonomyCreateDialog({
  entity,
  storeSlug,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        {TAXONOMY[entity].createDialog}
      </Button>
      {open ? (
        <TaxonomyFormDialog
          entity={entity}
          storeSlug={storeSlug}
          sortOrder={0}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Edit + delete for one row. `sortOrder` comes from the row's position in the list. */
export function TaxonomyRowActions({
  entity,
  storeSlug,
  row,
  sortOrder,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  row: TaxonomyRow;
  sortOrder: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const labels = TAXONOMY[entity];

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntity(entity, storeSlug, row.id),
    onSuccess: () => {
      setConfirming(false);
      router.refresh();
    },
    onError: (error) => setDeleteError(serverMessage(error, entity, "delete")),
  });

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Editar ${labels.singular} ${row.name}`}
        onClick={() => setEditing(true)}
      >
        Editar
      </Button>
      <Button
        size="sm"
        variant="destructive"
        aria-label={`Excluir ${labels.singular} ${row.name}`}
        onClick={() => {
          setDeleteError(null);
          setConfirming(true);
        }}
      >
        Excluir
      </Button>

      {editing ? (
        <TaxonomyFormDialog
          entity={entity}
          storeSlug={storeSlug}
          row={row}
          sortOrder={sortOrder}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {confirming ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{`Excluir a ${labels.singular} "${row.name}"?`}</AlertDialogTitle>
              <AlertDialogDescription>
                O registro será removido permanentemente. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {deleteError ? (
              <Alert variant="destructive">
                <AlertTitle>Não foi possível excluir</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
