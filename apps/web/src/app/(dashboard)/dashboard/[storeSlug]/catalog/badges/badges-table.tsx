"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";

type BadgeRow = {
  id: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  itemsCount: number;
};

type StatusFilter = "all" | "active" | "inactive";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const NAME_MAX = 64;

const IMAGE_URL_MAX = 1000;

/** Absolute http(s) only, matching the contract; a relative path would not resolve off-site. */
const IMAGE_URL = /^https?:\/\/\S+$/i;

function validateName(name: string) {
  const trimmed = name.trim();

  if (!trimmed) return "Informe o nome da etiqueta.";

  if (trimmed.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`;

  return undefined;
}

function validateImageUrl(imageUrl: string) {
  const trimmed = imageUrl.trim();

  if (!trimmed) return "Informe a URL da imagem.";

  if (trimmed.length > IMAGE_URL_MAX) return `Use no máximo ${IMAGE_URL_MAX} caracteres.`;

  if (!IMAGE_URL.test(trimmed)) return "Use uma URL completa (http:// ou https://).";

  return undefined;
}

/** The server never sends user copy, so codes map to pt-BR here. */
function serverMessage(error: Error, action: "save" | "delete"): string {
  if (error instanceof ORPCError) {
    if (error.code === "CONFLICT") return "Já existe uma etiqueta com este nome.";

    if (error.code === "FORBIDDEN")
      return "Você não tem permissão para editar o catálogo desta loja.";

    if (error.code === "NOT_FOUND") return "Etiqueta não encontrada nesta loja.";

    if (error.code === "VALIDATION_FAILED" || error.code === "INVALID_INPUT")
      return "Revise os campos destacados e tente novamente.";
  }

  return action === "delete"
    ? "Não foi possível excluir a etiqueta. Tente novamente."
    : "Não foi possível salvar a etiqueta. Tente novamente.";
}

function matchesStatus(status: StatusFilter, isActive: boolean) {
  if (status === "active") return isActive;

  if (status === "inactive") return !isActive;

  return true;
}

/** The thumbnail, preview and storefront all render the same user-supplied URL. */
function BadgeImage({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className: string;
  onError?: () => void;
}) {
  return (
    // eslint-disable-next-line nextjs/no-img-element -- badge images are arbitrary tenant URLs, outside the next/image allowlist
    <img src={src} alt={alt} loading="lazy" className={className} onError={onError} />
  );
}

function BadgeFormDialog({
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
  const [active, setActive] = useState(row?.isActive ?? true);
  const [touched, setTouched] = useState({ name: false, imageUrl: false });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const nameError = validateName(name);

  const imageUrlError = validateImageUrl(imageUrl);

  const errors = { name: nameError, imageUrl: imageUrlError };

  const invalid = (field: keyof typeof errors) =>
    (touched[field] || submitted) && Boolean(errors[field]);

  const fieldError = (field: keyof typeof errors) =>
    invalid(field) ? (
      <FieldError id={`${fieldId}-${field}-error`}>{errors[field]}</FieldError>
    ) : null;

  const mutation = useMutation({
    mutationFn: () => {
      const panel = client().panel;
      const trimmedUrl = imageUrl.trim();

      return row
        ? panel.updateBadge({
            storeSlug,
            badgeId: row.id,
            name: name.trim(),
            imageUrl: trimmedUrl,
            isActive: active,
          })
        : panel.createBadge({
            storeSlug,
            name: name.trim(),
            imageUrl: trimmedUrl,
            isActive: active,
          });
    },
    onSuccess: () => {
      router.refresh();
      onClose();
    },
    onError: (mutationError) => setServerError(serverMessage(mutationError, "save")),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    if (nameError || imageUrlError) {
      const formEl = event.currentTarget;

      requestAnimationFrame(() => {
        formEl.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });

      return;
    }

    mutation.mutate();
  };

  const trimmedUrl = imageUrl.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          <DialogDescription>
            A imagem aparece sobre o produto no cardápio; use PNG ou WebP com fundo transparente.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor={`${fieldId}-name`}>Nome</FieldLabel>
              <Input
                id={`${fieldId}-name`}
                value={name}
                maxLength={NAME_MAX}
                autoComplete="off"
                aria-invalid={invalid("name")}
                aria-describedby={invalid("name") ? `${fieldId}-name-error` : undefined}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                placeholder="Ex.: Mais vendido"
              />
              {fieldError("name")}
            </Field>

            <Field data-invalid={invalid("imageUrl")}>
              <FieldLabel htmlFor={`${fieldId}-image`}>URL da imagem</FieldLabel>
              <Input
                id={`${fieldId}-image`}
                value={imageUrl}
                maxLength={IMAGE_URL_MAX}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalid("imageUrl")}
                aria-describedby={invalid("imageUrl") ? `${fieldId}-imageUrl-error` : undefined}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  setPreviewFailed(false);
                }}
                onBlur={() => setTouched((current) => ({ ...current, imageUrl: true }))}
                placeholder="https://…/etiqueta.png"
              />
              {fieldError("imageUrl")}
              <FieldDescription>
                A imagem é exibida no tamanho original, então prefira algo perto de 24&nbsp;px de
                altura.
              </FieldDescription>
            </Field>

            <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-muted/40 p-2">
              {trimmedUrl && !previewFailed ? (
                <BadgeImage
                  src={trimmedUrl}
                  alt="Prévia da etiqueta"
                  className="h-8 w-auto max-w-32 object-contain"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {previewFailed ? "Não foi possível carregar a imagem." : "Prévia da imagem"}
                </span>
              )}
            </div>

            <Field orientation="horizontal" className="w-auto">
              <Switch
                id={`${fieldId}-active`}
                checked={active}
                onCheckedChange={setActive}
                aria-describedby={`${fieldId}-active-description`}
              />
              <FieldLabel htmlFor={`${fieldId}-active`}>Ativa</FieldLabel>
              <FieldDescription id={`${fieldId}-active-description`} className="w-full">
                Etiquetas inativas continuam nos produtos, mas não aparecem no cardápio.
              </FieldDescription>
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

function BadgeDeleteDialog({
  storeSlug,
  row,
  onClose,
}: {
  storeSlug: string;
  row: BadgeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => client().panel.deleteBadge({ storeSlug, badgeId: row.id }),
    onSuccess: () => {
      router.refresh();
      onClose();
    },
    onError: (error) => setDeleteError(serverMessage(error, "delete")),
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
          <AlertDialogTitle>{`Excluir a etiqueta "${row.name}"?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {row.itemsCount > 0
              ? `Ela será removida dos ${row.itemsCount} produtos vinculados. Esta ação não pode ser desfeita.`
              : "Ela será removida permanentemente. Esta ação não pode ser desfeita."}
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
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {mutation.isPending ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The toolbar button that opens an empty form. */
export function BadgeCreateButton({ storeSlug, label }: { storeSlug: string; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        {label ?? "Nova etiqueta"}
      </Button>
      {open ? <BadgeFormDialog storeSlug={storeSlug} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function BadgesTable({ badges, storeSlug }: { badges: BadgeRow[]; storeSlug: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BadgeRow | null>(null);
  const [deleting, setDeleting] = useState<BadgeRow | null>(null);

  const term = query.trim().toLowerCase();

  const filtered = badges.filter(
    (badge) =>
      (term === "" || badge.name.toLowerCase().includes(term)) &&
      matchesStatus(status, badge.isActive),
  );

  const hasFilters = query !== "" || status !== "all";

  const activeMutation = useMutation({
    mutationFn: ({ badgeId, isActive }: { badgeId: string; isActive: boolean }) =>
      client().panel.updateBadge({ storeSlug, badgeId, isActive }),
    onMutate: ({ badgeId, isActive }) => {
      setActiveOverrides((current) => ({ ...current, [badgeId]: isActive }));
    },
    onSuccess: () => {
      setSwitchError(null);
      router.refresh();
    },
    onError: (_error, { badgeId }) => {
      setActiveOverrides((current) => {
        const next = { ...current };
        delete next[badgeId];

        return next;
      });
      setSwitchError("Não foi possível alterar a etiqueta. Tente novamente.");
    },
  });

  const activeSwitch = (badge: BadgeRow) => {
    const checked = activeOverrides[badge.id] ?? badge.isActive;

    const pending = activeMutation.isPending && activeMutation.variables?.badgeId === badge.id;

    return (
      <Switch
        size="sm"
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => activeMutation.mutate({ badgeId: badge.id, isActive: next })}
        aria-label={
          checked ? `Desativar a etiqueta ${badge.name}` : `Ativar a etiqueta ${badge.name}`
        }
      />
    );
  };

  const columns: ColumnDef<typeof dashboardTableFeatures, BadgeRow, unknown>[] = [
    {
      id: "imageUrl",
      header: () => <span className="sr-only">Imagem</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex size-8 items-center justify-center">
          <BadgeImage
            src={row.original.imageUrl}
            alt={`Etiqueta ${row.original.name}`}
            className="size-8 object-contain"
          />
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium underline-offset-4 hover:underline"
          aria-label={`Editar etiqueta ${row.original.name}`}
          onClick={() => setEditing(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "itemsCount",
      header: "Itens vinculados",
      cell: ({ row }) => (
        <span
          className={
            row.original.itemsCount === 0 ? "text-muted-foreground tabular-nums" : "tabular-nums"
          }
        >
          {row.original.itemsCount}
        </span>
      ),
    },
    {
      id: "active",
      header: () => <span className="sr-only">Ativa</span>,
      enableSorting: false,
      cell: ({ row }) => activeSwitch(row.original),
    },
    {
      id: "actions",
      header: "Ações",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar etiqueta ${row.original.name}`}
            onClick={() => setEditing(row.original)}
          >
            <Pencil data-icon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Excluir etiqueta ${row.original.name}`}
            onClick={() => setDeleting(row.original)}
          >
            <Trash2 data-icon aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="max-w-sm min-w-[16rem] flex-1">
            <InputGroupAddon align="inline-start">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar etiquetas por nome…"
              aria-label="Buscar etiquetas"
            />
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Situação das etiquetas"
            value={[status]}
            onValueChange={(next) => {
              const selected = next[0];

              if (selected === "all" || selected === "active" || selected === "inactive")
                setStatus(selected);
            }}
          >
            <ToggleGroupItem value="all">Todos</ToggleGroupItem>
            <ToggleGroupItem value="active">Ativos</ToggleGroupItem>
            <ToggleGroupItem value="inactive">Inativos</ToggleGroupItem>
          </ToggleGroup>

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} de {badges.length} itens
        </p>
      </div>

      {switchError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível alterar a etiqueta</AlertTitle>
          <AlertDescription>{switchError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable<BadgeRow>
        columns={columns}
        data={filtered}
        hideToolbar
        tableLabel="Etiquetas"
        onRowClick={(row) => setEditing(row)}
      />

      {editing ? (
        <BadgeFormDialog storeSlug={storeSlug} row={editing} onClose={() => setEditing(null)} />
      ) : null}

      {deleting ? (
        <BadgeDeleteDialog storeSlug={storeSlug} row={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}
