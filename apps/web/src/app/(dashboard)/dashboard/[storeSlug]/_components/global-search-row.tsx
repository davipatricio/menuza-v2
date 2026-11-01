"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  ChevronRight,
  FileText,
  FolderTree,
  Layers,
  ListTree,
  MoreHorizontal,
  Package,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "cn";

import {
  copyText,
  setCouponStatusAction,
  setProductAvailabilityAction,
} from "./global-search-actions.ts";
import { canMutate, type EntitySearchItem, type SearchItem } from "./global-search-utils.ts";

type RowIcon = typeof FileText;

/** One lucide icon per result kind; pages keep a document icon. */
const KIND_ICONS = {
  page: FileText,
  product: Package,
  coupon: Ticket,
  customer: Users,
  tag: Tag,
  category: FolderTree,
  department: Layers,
  badge: Award,
  subcategory: ListTree,
} satisfies Record<SearchItem["kind"], RowIcon>;

/** Contract enums are ASCII; the row is the only place they become pt-BR. */
const STATUS_LABELS = new Map([
  ["available", "Disponível"],
  ["unavailable", "Indisponível"],
  ["active", "Ativo"],
  ["disabled", "Desativado"],
  ["expired", "Expirado"],
]);

const UPDATE_ERROR = "Não foi possível atualizar. Tente novamente.";

const COPY_ERROR = "Não foi possível copiar.";

const NO_PERMISSION = "Sem permissão";

const COUPON_EXPIRED = "Cupom expirado";

interface StatusOverride {
  seed: string;
  status: string;
}

/** The optimistic status wins only while the server still reports the value it replaced. */
function resolveStatus(
  item: EntitySearchItem,
  override: StatusOverride | null,
): string | undefined {
  if (override === null) return item.status;

  return override.seed === item.status ? override.status : item.status;
}

function RowStatus({ status }: { status: string | undefined }) {
  const label = status ? STATUS_LABELS.get(status) : undefined;

  return label ? <Badge variant="outline">{label}</Badge> : null;
}

function resolveSublabel(item: SearchItem): string | undefined {
  return item.kind === "page" ? item.section : item.sublabel;
}

/** Coupons copy the printed code and customers the address; everything else copies the name. */
function copyTarget(item: EntitySearchItem): string {
  return item.kind === "coupon" || item.kind === "customer"
    ? (item.sublabel ?? item.label)
    : item.label;
}

function copyDone(item: EntitySearchItem): string {
  if (item.kind === "coupon") return "Código copiado.";

  return item.kind === "customer" ? "E-mail copiado." : "Nome copiado.";
}

/** Cursor-visible row: the option carries no interactive child, only text. */
export function GlobalSearchRow({
  item,
  active,
  id,
  onSelect,
}: {
  item: SearchItem;
  active: boolean;
  id?: string;
  onSelect: () => void;
}) {
  const Icon = KIND_ICONS[item.kind];
  const sublabel = resolveSublabel(item);

  return (
    <button
      type="button"
      role="option"
      tabIndex={-1}
      id={id}
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-hidden select-none",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />

      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {sublabel ? (
          <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
        ) : null}
      </span>

      <RowStatus status={item.kind === "page" ? undefined : item.status} />
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function RowMenu({
  item,
  canWrite,
  pending,
  expired,
  couponActive,
  onNavigate,
  onToggle,
  onCopy,
}: {
  item: EntitySearchItem;
  canWrite: boolean;
  pending: boolean;
  expired: boolean;
  couponActive: boolean;
  onNavigate: () => void;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const navigateLabel =
    item.kind === "product"
      ? "Ir para página do produto"
      : item.kind === "customer"
        ? "Ir para página do cliente"
        : "Abrir";

  const copyLabel =
    item.kind === "coupon"
      ? "Copiar código"
      : item.kind === "customer"
        ? "Copiar e-mail"
        : "Copiar nome";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${item.label}`} />}
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onNavigate}>{navigateLabel}</DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>{copyLabel}</DropdownMenuItem>

        {item.kind === "coupon" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canWrite || expired || pending} onClick={onToggle}>
              {couponActive ? "Desativar" : "Ativar"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Actions for the highlighted row only, rendered once beside the listbox. */
export function GlobalSearchRowActions({
  item,
  storeSlug,
  canWrite,
  onNavigate,
}: {
  item: EntitySearchItem;
  storeSlug: string;
  canWrite: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** Optimistic status tagged with the value it replaced, so a server update wins. */
  const [override, setOverride] = useState<StatusOverride | null>(null);

  const serverStatus = item.status;
  const status = resolveStatus(item, override);
  const couponActive = status === "active";
  const productActive = status === "available";
  const expired = status === "expired";
  const mutable = canMutate(item.kind, canWrite);
  const switchable = item.kind === "coupon" || item.kind === "product";
  const checked = item.kind === "coupon" ? couponActive : productActive;

  const disabledReason = !canWrite ? NO_PERMISSION : expired ? COUPON_EXPIRED : undefined;

  const switchLabel =
    item.kind === "coupon"
      ? couponActive
        ? `Desativar o cupom ${item.label}`
        : `Ativar o cupom ${item.label}`
      : productActive
        ? `Marcar ${item.label} como indisponível`
        : `Marcar ${item.label} como disponível`;

  const run = async (next: string, success: string, action: () => Promise<void>) => {
    setMessage(null);
    setPending(true);
    setOverride({ seed: serverStatus ?? "", status: next });

    try {
      await action();
      setMessage(success);
      router.refresh();
    } catch {
      setOverride(null);
      setMessage(UPDATE_ERROR);
    } finally {
      setPending(false);
    }
  };

  const toggle = (next: boolean) => {
    if (item.kind === "coupon") {
      void run(next ? "active" : "disabled", next ? "Cupom ativado." : "Cupom desativado.", () =>
        setCouponStatusAction(storeSlug, item.id, next ? "active" : "disabled"),
      );

      return;
    }

    void run(
      next ? "available" : "unavailable",
      next ? "Produto disponível." : "Produto indisponível.",
      () => setProductAvailabilityAction(storeSlug, item.id, next),
    );
  };

  const copy = async () => {
    setMessage(null);

    const copied = await copyText(copyTarget(item));

    setMessage(copied ? copyDone(item) : COPY_ERROR);
  };

  return (
    <div className="flex items-center gap-2 border-t px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.label}</span>

      {message ? (
        <span role="status" className="max-w-40 truncate text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}

      {disabledReason ? (
        <span className="text-xs text-muted-foreground">{disabledReason}</span>
      ) : null}

      {switchable ? (
        <Switch
          size="sm"
          checked={checked}
          disabled={!mutable || expired || pending}
          title={disabledReason}
          aria-label={switchLabel}
          onCheckedChange={toggle}
        />
      ) : null}

      <RowMenu
        item={item}
        canWrite={canWrite}
        pending={pending}
        expired={expired}
        couponActive={couponActive}
        onNavigate={onNavigate}
        onToggle={() => toggle(!couponActive)}
        onCopy={() => void copy()}
      />
    </div>
  );
}
