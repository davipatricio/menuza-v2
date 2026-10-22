"use client";

import * as React from "react";
import { Tag, Truck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrderTotals, type OrderLine } from "@/hooks/use-order-totals";
import { cn } from "cn";

const subscribeNothing = () => () => {};

/**
 * Your locale, or the visitor's once hydrated. The server can't know the
 * visitor's locale, and its HTML must match the first client render — a
 * server in en-IN prints "1,24,000" where an en-US browser prints
 * "124,000" — so until hydration it formats in en-US.
 */
function useFormatLocale(locale?: string) {
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return locale ?? (hydrated ? undefined : "en-US");
}

export interface OrderSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  lines: OrderLine[];
  currency?: string;
  locale?: string;
  freeShippingThreshold?: number;
  flatShipping?: number;
  taxRate?: number;
  appliedCode?: string | null;
  discountRate?: number;
  ctaLabel?: string;
  /** Reject with an Error whose message is shown inline. */
  onApplyCode?: (code: string) => void | Promise<void>;
  onRemoveCode?: () => void;
  onCheckout?: () => void;
}

export function OrderSummary({
  lines,
  currency = "USD",
  locale: localeProp,
  freeShippingThreshold,
  flatShipping = 0,
  taxRate = 0,
  appliedCode = null,
  discountRate = 0,
  ctaLabel = "Checkout",
  onApplyCode,
  onRemoveCode,
  onCheckout,
  className,
  ...props
}: OrderSummaryProps) {
  const locale = useFormatLocale(localeProp);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const t = useOrderTotals({
    lines,
    discountRate: appliedCode ? discountRate : 0,
    freeShippingThreshold,
    flatShipping,
    taxRate,
  });

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!code.trim() || pending) return;
    setPending(true);
    setError(null);

    try {
      await onApplyCode?.(code.trim());
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code isn't valid.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn("space-y-5 border p-5 sm:p-6", className)} {...props}>
      <h2 className="text-2xl">Summary</h2>

      {freeShippingThreshold !== undefined ? (
        <div className="space-y-2 border-y py-4">
          <p className="text-[13px]">
            {t.toFreeShipping > 0 ? (
              <>
                <span className="tabular-nums">{money.format(t.toFreeShipping)}</span> from free
                shipping
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-[var(--success)]">
                <Truck className="size-3.5" aria-hidden /> Free shipping unlocked
              </span>
            )}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(t.freeShippingProgress * 100)}
            aria-label="Progress toward free shipping"
            className="h-1 bg-secondary"
          >
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${t.freeShippingProgress * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {appliedCode ? (
        <div className="flex items-center justify-between border border-dashed px-3 py-2.5">
          <span className="flex items-center gap-2 text-[11px] tracking-[0.16em] text-[var(--success)] uppercase">
            <Tag className="size-3" aria-hidden /> {appliedCode}
          </span>
          <button type="button" onClick={onRemoveCode} aria-label={`Remove code ${appliedCode}`}>
            <X className="size-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      ) : onApplyCode ? (
        <form onSubmit={apply} className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Promo code"
              aria-label="Promo code"
              aria-invalid={error ? true : undefined}
              className="h-10 rounded-none text-[13px]"
            />
            <Button type="submit" variant="outline" disabled={pending} className="h-10 text-[13px]">
              {pending ? "Checking…" : "Apply"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-[var(--sale)]">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <dl className="space-y-2.5 text-[13px] tabular-nums">
        <Row label={`Subtotal (${t.itemCount} items)`} value={money.format(t.subtotal)} />
        {t.discount > 0 ? (
          <Row label="Discount" value={`−${money.format(t.discount)}`} tone="sale" />
        ) : null}
        <Row
          label="Shipping"
          value={t.shipping === 0 ? "Free" : money.format(t.shipping)}
          tone={t.shipping === 0 ? "success" : undefined}
        />
        {taxRate > 0 ? <Row label="Estimated tax" value={money.format(t.tax)} muted /> : null}
      </dl>

      <div className="flex items-baseline justify-between border-t pt-4">
        <span className="text-[11px] tracking-[0.16em] uppercase">Total</span>
        <span className="text-3xl tabular-nums">{money.format(t.total)}</span>
      </div>

      <Button
        onClick={onCheckout}
        disabled={t.itemCount === 0}
        className="h-12 w-full text-[13px] tracking-[0.12em]"
      >
        {ctaLabel.toUpperCase()}
      </Button>

      {taxRate > 0 ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Tax and shipping are estimates until an address is entered.
        </p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "sale" | "success";
}) {
  return (
    <div className="flex justify-between">
      <dt className={cn(muted && "text-muted-foreground")}>{label}</dt>
      <dd
        className={cn(
          muted && "text-muted-foreground",
          tone === "sale" && "text-[var(--sale)]",
          tone === "success" && "text-[var(--success)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
