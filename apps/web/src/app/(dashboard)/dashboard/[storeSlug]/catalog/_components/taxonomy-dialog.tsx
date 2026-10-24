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
  FieldTitle,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";

export type TaxonomyEntity = "category" | "department" | "subcategory" | "tag";

export type TaxonomyRow = {
  id: string;
  name: string;
  active?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  categoryId?: string;
  departmentIds?: string[];
  itemsCount?: number;
};

export type TaxonomyOption = { id: string; name: string };

/** A category the deactivation dialog may move products into. */
export type MoveCategoryOption = { id: string; name: string; departmentIds: string[] };

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

type TaxonomyWriteInput =
  | {
      entity: "category";
      storeSlug: string;
      name: string;
      sortOrder: number;
      active: boolean;
      departmentIds: string[];
    }
  | { entity: "department"; storeSlug: string; name: string; active: boolean }
  | {
      entity: "subcategory";
      storeSlug: string;
      name: string;
      categoryId: string;
      sortOrder: number;
      active: boolean;
    }
  | { entity: "tag"; storeSlug: string; name: string; isActive: boolean };

/** One label set per entity, so the screens stay copy-identical. */
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
    inUse: "Mova os produtos desta categoria antes de excluí-la.",
    notFound: "Categoria não encontrada nesta loja.",
  },
  subcategory: {
    singular: "subcategoria",
    createDialog: "Nova subcategoria",
    editDialog: "Editar subcategoria",
    duplicate: "Já existe uma subcategoria com esse nome nesta categoria.",
    inUse: "Esta subcategoria ainda tem produtos. Mova os produtos antes de excluí-la.",
    notFound: "Subcategoria não encontrada nesta loja.",
  },
  department: {
    singular: "departamento",
    createDialog: "Novo departamento",
    editDialog: "Editar departamento",
    duplicate: "Já existe um departamento com esse nome.",
    inUse: "Desvincule as categorias deste departamento antes de excluí-lo.",
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

/** Every entity carries an active flag; only the label differs. */
const ACTIVE_COPY: Record<TaxonomyEntity, { label: string; description: string }> = {
  category: {
    label: "Ativa",
    description: "Categorias inativas deixam de aparecer no cardápio.",
  },
  department: {
    label: "Ativo",
    description: "Departamentos inativos continuam cadastrados e podem ser reativados.",
  },
  subcategory: {
    label: "Ativa",
    description: "Subcategorias inativas deixam de aparecer no cardápio.",
  },
  tag: {
    label: "Ativa",
    description:
      "Desative para ocultar a tag do cardápio. Os produtos e os filtros do painel continuam com ela.",
  },
};

async function createEntity(input: TaxonomyWriteInput) {
  const panel = client().panel;

  switch (input.entity) {
    case "category":
      return panel.createCategory({
        storeSlug: input.storeSlug,
        name: input.name,
        sortOrder: input.sortOrder,
        active: input.active,
        departmentIds: input.departmentIds,
      });

    case "subcategory":
      return panel.createSubcategory({
        storeSlug: input.storeSlug,
        name: input.name,
        categoryId: input.categoryId,
        sortOrder: input.sortOrder,
        active: input.active,
      });

    case "department":
      return panel.createDepartment({
        storeSlug: input.storeSlug,
        name: input.name,
        active: input.active,
      });

    case "tag":
      return panel.createTag({
        storeSlug: input.storeSlug,
        name: input.name,
        isActive: input.isActive,
      });
  }
}

async function updateEntity(id: string, input: TaxonomyWriteInput) {
  const panel = client().panel;

  switch (input.entity) {
    case "category":
      return panel.updateCategory({
        storeSlug: input.storeSlug,
        categoryId: id,
        name: input.name,
        sortOrder: input.sortOrder,
        active: input.active,
        departmentIds: input.departmentIds,
      });

    case "subcategory":
      return panel.updateSubcategory({
        storeSlug: input.storeSlug,
        subcategoryId: id,
        name: input.name,
        categoryId: input.categoryId,
        sortOrder: input.sortOrder,
        active: input.active,
      });

    case "department":
      return panel.updateDepartment({
        storeSlug: input.storeSlug,
        departmentId: id,
        name: input.name,
        active: input.active,
      });

    case "tag":
      return panel.updateTag({
        storeSlug: input.storeSlug,
        tagId: id,
        name: input.name,
        isActive: input.isActive,
      });
  }
}

async function deleteEntity(entity: TaxonomyEntity, storeSlug: string, id: string) {
  const panel = client().panel;

  switch (entity) {
    case "category":
      return panel.deleteCategory({ storeSlug, categoryId: id });
    case "subcategory":
      return panel.deleteSubcategory({ storeSlug, subcategoryId: id });
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

function validateName(name: string) {
  const trimmed = name.trim();

  if (!trimmed) return "Informe o nome.";

  if (trimmed.length > NAME_MAX) return "Use no máximo 80 caracteres.";

  return undefined;
}

function validateSortOrder(sortOrder: string) {
  const order = Number(sortOrder);

  if (sortOrder.trim() === "") return "Informe uma ordem válida.";

  if (!Number.isInteger(order)) return "Use um número inteiro.";

  if (order < 0) return "O valor mínimo é 0.";

  return undefined;
}

const HAS_SORT_ORDER: Record<TaxonomyEntity, boolean> = {
  category: true,
  department: false,
  subcategory: true,
  tag: false,
};

/** One description per entity, so create and edit read differently. */
function formDescription(entity: TaxonomyEntity, editing: boolean): string {
  switch (entity) {
    case "department":
      return editing
        ? "Altere o nome ou o status do departamento."
        : "Nome do departamento e se ele fica ativo.";
    case "tag":
      return editing
        ? "Altere o nome da tag ou oculte-a do cardápio."
        : "Dê um nome à tag e defina se ela aparece no cardápio.";
    case "subcategory":
      return editing
        ? "Altere o nome, a categoria, a posição ou o status."
        : "Nome, categoria e posição da subcategoria.";
    case "category":
      return editing
        ? "Altere o nome, a posição, o status e os departamentos."
        : "Nome, posição, status e departamentos da categoria.";
  }
}

/** The strict schemas reject extra keys, so each entity's arm carries only its own fields. */
function writeInput(
  entity: TaxonomyEntity,
  storeSlug: string,
  name: string,
  active: boolean,
  order: string,
  categoryId: string,
  departmentIds: string[],
): TaxonomyWriteInput {
  if (entity === "tag") return { entity: "tag", storeSlug, name, isActive: active };

  if (entity === "department") return { entity: "department", storeSlug, name, active };

  if (entity === "subcategory") {
    return { entity: "subcategory", storeSlug, name, categoryId, sortOrder: Number(order), active };
  }

  return {
    entity: "category",
    storeSlug,
    name,
    sortOrder: Number(order),
    active,
    departmentIds,
  };
}

/**
 * Create and edit share one form dialog; `row` absent means create.
 *
 * `categories` is only read by the subcategory form, `departments` only by the
 * category form — the caller passes whichever it has.
 */
export function TaxonomyFormDialog({
  entity,
  storeSlug,
  row,
  sortOrder = 0,
  categories = [],
  departments = [],
  onClose,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  row?: TaxonomyRow;
  sortOrder?: number;
  categories?: TaxonomyOption[];
  departments?: TaxonomyOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const [name, setName] = useState(row?.name ?? "");
  const [active, setActive] = useState(row?.active ?? row?.isActive ?? true);
  const [order, setOrder] = useState(String(row?.sortOrder ?? sortOrder));
  const [categoryId, setCategoryId] = useState(row?.categoryId ?? categories[0]?.id ?? "");
  const [departmentIds, setDepartmentIds] = useState<string[]>(row?.departmentIds ?? []);
  const [touched, setTouched] = useState({ name: false, sortOrder: false });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = validateName(name);

  const orderError = HAS_SORT_ORDER[entity] ? validateSortOrder(order) : undefined;

  const categoryError =
    entity === "subcategory" && categoryId === "" ? "Escolha uma categoria." : undefined;

  const errors = { name: nameError, sortOrder: orderError, categoryId: categoryError };

  const invalid = (field: keyof typeof errors) => {
    const wasTouched = field === "name" || field === "sortOrder" ? touched[field] : false;

    return (wasTouched || submitted) && Boolean(errors[field]);
  };

  const mutation = useMutation({
    mutationFn: (input: TaxonomyWriteInput) =>
      row ? updateEntity(row.id, input) : createEntity(input),
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

    if (errors.name || errors.sortOrder || errors.categoryId) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });

      return;
    }

    mutation.mutate(
      writeInput(entity, storeSlug, name.trim(), active, order, categoryId, departmentIds),
    );
  };

  const error = (field: keyof typeof errors) =>
    invalid(field) ? (
      <FieldError id={`${fieldId}-${field}-error`}>{errors[field]}</FieldError>
    ) : null;

  const describedBy = (field: keyof typeof errors) =>
    invalid(field) ? `${fieldId}-${field}-error` : undefined;

  const categoryOptions = categories.map((category) => ({
    label: category.name,
    value: category.id,
  }));

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
          <DialogDescription>{formDescription(entity, row !== undefined)}</DialogDescription>
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

            {entity === "subcategory" ? (
              <Field data-invalid={invalid("categoryId")}>
                <FieldLabel htmlFor={`${fieldId}-category`}>Categoria</FieldLabel>
                <Select
                  items={categoryOptions}
                  value={categoryId}
                  onValueChange={(next) => setCategoryId(next ?? "")}
                >
                  <SelectTrigger
                    id={`${fieldId}-category`}
                    className="w-full"
                    aria-invalid={invalid("categoryId")}
                    aria-describedby={describedBy("categoryId")}
                  >
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {error("categoryId")}
              </Field>
            ) : null}

            {entity === "category" ? (
              <Field>
                <FieldTitle>Departamentos</FieldTitle>
                {departments.length === 0 ? (
                  <FieldDescription>
                    Nenhum departamento cadastrado. Crie um para agrupar esta categoria.
                  </FieldDescription>
                ) : (
                  <ToggleGroup
                    multiple
                    variant="outline"
                    size="sm"
                    className="flex-wrap"
                    aria-label="Departamentos da categoria"
                    value={departmentIds}
                    onValueChange={setDepartmentIds}
                  >
                    {departments.map((department) => (
                      <ToggleGroupItem key={department.id} value={department.id}>
                        {department.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                <FieldDescription>
                  A categoria aparece em cada departamento selecionado.
                </FieldDescription>
              </Field>
            ) : null}

            <Field orientation="horizontal" className="flex-wrap">
              <Switch
                id={`${fieldId}-active`}
                checked={active}
                onCheckedChange={setActive}
                aria-label={ACTIVE_COPY[entity].label}
                aria-describedby={`${fieldId}-active-description`}
              />
              <FieldLabel htmlFor={`${fieldId}-active`}>{ACTIVE_COPY[entity].label}</FieldLabel>
              <FieldDescription id={`${fieldId}-active-description`} className="w-full">
                {ACTIVE_COPY[entity].description}
              </FieldDescription>
            </Field>

            {HAS_SORT_ORDER[entity] ? (
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
            ) : null}
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

/** Confirmation with the server's conflict message inline. */
export function TaxonomyDeleteDialog({
  entity,
  storeSlug,
  row,
  onClose,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  row: TaxonomyRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const labels = TAXONOMY[entity];

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntity(entity, storeSlug, row.id),
    onSuccess: () => {
      router.refresh();
      onClose();
    },
    onError: (error) => setDeleteError(serverMessage(error, entity, "delete")),
  });

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
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
  );
}

/** The toolbar button that opens an empty form. */
export function TaxonomyCreateDialog({
  entity,
  storeSlug,
  label,
  sortOrder = 0,
  categories,
  departments,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  label?: string;
  sortOrder?: number;
  categories?: TaxonomyOption[];
  departments?: TaxonomyOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        {label ?? TAXONOMY[entity].createDialog}
      </Button>
      {open ? (
        <TaxonomyFormDialog
          entity={entity}
          storeSlug={storeSlug}
          sortOrder={sortOrder}
          categories={categories}
          departments={departments}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The row's destructive action. Editing moved to the row click, so this stays
 * delete-only; the props are unchanged so the tags screen keeps compiling.
 */
export function TaxonomyRowActions({
  entity,
  storeSlug,
  row,
}: {
  entity: TaxonomyEntity;
  storeSlug: string;
  row: TaxonomyRow;
  sortOrder?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const labels = TAXONOMY[entity];

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="destructive"
        aria-label={`Excluir ${labels.singular} ${row.name}`}
        onClick={() => setConfirming(true)}
      >
        Excluir
      </Button>

      {confirming ? (
        <TaxonomyDeleteDialog
          entity={entity}
          storeSlug={storeSlug}
          row={row}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Deactivating a department that still has products requires a destination
 * category. Only categories outside this department are offered, because moving
 * a product into a category of the department being disabled would leave it
 * orphaned from the storefront.
 */
export function DepartmentMoveDialog({
  storeSlug,
  department,
  categories,
  onClose,
}: {
  storeSlug: string;
  department: { id: string; name: string; itemsCount: number };
  categories: MoveCategoryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = categories.filter((category) => !category.departmentIds.includes(department.id));

  const selectOptions = options.map((category) => ({
    label: category.name,
    value: category.id,
  }));

  const mutation = useMutation({
    mutationFn: () =>
      client().panel.updateDepartment({
        storeSlug,
        departmentId: department.id,
        name: department.name,
        active: false,
        moveProductsToCategoryId: targetId,
      }),
    onSuccess: () => {
      router.refresh();
      onClose();
    },
    onError: (mutationError) => {
      if (mutationError instanceof ORPCError && mutationError.code === "CONFLICT") {
        setError(mutationError.message);

        return;
      }

      setError("Não foi possível desativar. Tente novamente.");
    },
  });

  const { itemsCount } = department;
  const countLabel = itemsCount === 1 ? "produto está" : "produtos estão";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desativar departamento?</DialogTitle>
          <DialogDescription>
            {`${itemsCount} ${countLabel} em categorias deste departamento. Escolha uma categoria de destino para movê-los antes de desativar.`}
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria fora deste departamento. Crie uma categoria em outro departamento para
            continuar.
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="department-move-target">Mover produtos para</FieldLabel>
            <Select
              items={selectOptions}
              value={targetId}
              onValueChange={(next) => setTargetId(next ?? "")}
            >
              <SelectTrigger id="department-move-target" className="w-full">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {selectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível desativar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={targetId === "" || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Mover e desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
