"use client";

import * as React from "react";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import { ArrowRight, Check, Eye, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/ecomcn/price-tag";
import type { ProductCardProduct } from "@/components/ecomcn/product-card";
import { cn } from "cn";

/**
 * Quick view with a shared-element morph: the card's image grows into the
 * dialog's image and shrinks back on close, so the shopper never loses track
 * of which product they opened. Motion's `layoutId` does the morph; a native
 * <dialog> does the modal work (top layer, inert page, Escape).
 *
 * The morph every ecomcn block follows: one settle curve, no bounce, and
 * nothing but a fade under reduced motion.
 */

// Ease-out, no overshoot: an editorial morph should settle, not bounce.
const MORPH: Transition = { duration: 0.45, ease: [0.2, 0, 0, 1] };

type AddState = "idle" | "pending" | "added";

interface ActiveView {
  product: ProductCardProduct;
  colorIndex: number;
}

export interface ProductQuickViewContextValue {
  active: ActiveView | null;
  open: (
    product: ProductCardProduct,
    options?: { colorIndex?: number; trigger?: HTMLElement | null },
  ) => void;
  close: () => void;
  /** The shared id that links a card's image to the dialog's. */
  layoutId: (productId: string) => string;
}

const ProductQuickViewContext = React.createContext<ProductQuickViewContextValue | null>(null);

export function useProductQuickView() {
  const context = React.useContext(ProductQuickViewContext);

  if (!context) {
    throw new Error("useProductQuickView must be used within <ProductQuickView>.");
  }

  return context;
}

/* ─── root ─────────────────────────────────────────────────────────────── */

export interface ProductQuickViewProps {
  /** The listing — cards containing ProductQuickViewImage and ProductQuickViewTrigger. */
  children: React.ReactNode;
  currency?: string;
  locale?: string;
  /** Return a promise to keep the button pending until it settles. */
  onAddToBag?: (product: ProductCardProduct, colorIndex: number) => void | Promise<void>;
  /** Extra content under the price: a description, sizes, a size-guide link. */
  renderDetails?: (product: ProductCardProduct) => React.ReactNode;
  detailsLabel?: string;
}

export function ProductQuickView({
  children,
  currency = "USD",
  locale,
  onAddToBag,
  renderDetails,
  detailsLabel = "View full details",
}: ProductQuickViewProps) {
  const [active, setActive] = React.useState<ActiveView | null>(null);
  const trigger = React.useRef<HTMLElement | null>(null);
  // Namespaces the layout ids, so two quick views on one page never morph
  // into each other's dialogs.
  const scope = React.useId();

  const open = React.useCallback<ProductQuickViewContextValue["open"]>((product, options = {}) => {
    trigger.current =
      options.trigger ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setActive({ product, colorIndex: options.colorIndex ?? 0 });
  }, []);

  const close = React.useCallback(() => setActive(null), []);
  const layoutId = React.useCallback((id: string) => `${scope}-quick-view-${id}`, [scope]);

  const context = React.useMemo(
    () => ({ active, open, close, layoutId }),
    [active, open, close, layoutId],
  );

  return (
    <ProductQuickViewContext.Provider value={context}>
      {children}
      <AnimatePresence>
        {active ? (
          <QuickViewDialog
            key={active.product.id}
            view={active}
            returnFocus={() => {
              if (trigger.current?.isConnected) trigger.current.focus();
            }}
            currency={currency}
            locale={locale}
            onAddToBag={onAddToBag}
            renderDetails={renderDetails}
            detailsLabel={detailsLabel}
          />
        ) : null}
      </AnimatePresence>
    </ProductQuickViewContext.Provider>
  );
}

/* ─── parts used inside a card ─────────────────────────────────────────── */

export function ProductQuickViewImage({
  product,
  className,
  children,
}: {
  product: ProductCardProduct;
  className?: string;
  /** The card's image — usually <ProductCardImage />. */
  children: React.ReactNode;
}) {
  const { layoutId } = useProductQuickView();

  return (
    // reducedMotion="user": with the OS setting on, the dialog simply
    // appears — layout and transform animations are skipped entirely.
    <MotionConfig reducedMotion="user" transition={MORPH}>
      <motion.div
        layoutId={layoutId(product.id)}
        data-slot="product-quick-view-image"
        className={cn("absolute inset-0", className)}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export interface ProductQuickViewTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> {
  product: ProductCardProduct;
  /** Open on this colour — pass the card's selected colour. */
  colorIndex?: number;
}

export function ProductQuickViewTrigger({
  product,
  colorIndex,
  className,
  children,
  ...props
}: ProductQuickViewTriggerProps) {
  const { open } = useProductQuickView();

  return (
    // A full-frame layer that measures the card, so the button can drop its
    // label on a narrow card (two to a row on a phone) and stay clear of the
    // badge. It lets clicks through to the card everywhere but the button.
    <span
      data-slot="product-quick-view-anchor"
      className="@container pointer-events-none absolute inset-0 z-10"
    >
      <button
        type="button"
        aria-haspopup="dialog"
        data-slot="product-quick-view-trigger"
        onClick={(event) => open(product, { colorIndex, trigger: event.currentTarget })}
        className={cn(
          // Revealed on hover and on keyboard focus; always visible where
          // there is no hover at all.
          "pointer-events-auto absolute top-2 right-2 inline-flex h-8 min-w-8 items-center justify-center gap-1.5 bg-background/90 px-2 text-[11px] tracking-[0.14em] uppercase opacity-0 transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none @min-[15rem]:px-2.5 [@media(hover:none)]:opacity-100",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <Eye className="size-3.5" aria-hidden />
            {/* The words from 15rem of card up; below, the eye alone. */}
            <span className="sr-only @min-[15rem]:not-sr-only">Quick view</span>
          </>
        )}
        <span className="sr-only">: {product.name}</span>
      </button>
    </span>
  );
}

/* ─── the dialog ───────────────────────────────────────────────────────── */

function QuickViewDialog({
  view,
  returnFocus,
  currency,
  locale,
  onAddToBag,
  renderDetails,
  detailsLabel,
}: {
  view: ActiveView;
  returnFocus: () => void;
  currency: string;
  locale?: string;
  onAddToBag?: ProductQuickViewProps["onAddToBag"];
  renderDetails?: ProductQuickViewProps["renderDetails"];
  detailsLabel: string;
}) {
  const { close, layoutId } = useProductQuickView();
  const { product } = view;
  const dialog = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const [colorIndex, setColorIndex] = React.useState(view.colorIndex);
  const [addState, setAddState] = React.useState<AddState>("idle");
  const color = product.colors?.[colorIndex];

  React.useEffect(() => {
    const node = dialog.current;

    // showModal puts the dialog in the top layer and makes the page inert:
    // focus containment and Escape come from the platform, not from us.
    if (node && !node.open) node.showModal();

    // Lock page scroll, padding by the scrollbar's width so nothing behind
    // the overlay shifts sideways.
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    const before = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    root.style.overflow = "hidden";

    if (gap > 0) root.style.paddingRight = `${gap}px`;

    return () => {
      root.style.overflow = before.overflow;
      root.style.paddingRight = before.paddingRight;
      // This cleanup runs once the exit morph has finished and the dialog has
      // left the DOM. Any earlier and the page is still inert, the focus call
      // is ignored, and the shopper is dropped on <body>.
      returnFocus();
    };
    // Mount and unmount only: the dialog opens once per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToBag = async () => {
    if (!onAddToBag || addState === "pending") return;
    setAddState("pending");

    try {
      await onAddToBag(product, colorIndex);
      setAddState("added");
    } catch {
      setAddState("idle");
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-slot="product-quick-view"
      // Escape: play the closing morph instead of vanishing instantly.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={close}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-foreground backdrop:bg-transparent"
    >
      <div className="fixed inset-0 grid place-items-center overflow-y-auto p-4 sm:p-8">
        <motion.div
          aria-hidden
          className="fixed inset-0 bg-black/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={close}
        />

        <div className="relative grid w-full max-w-4xl md:grid-cols-[1.05fr_0.95fr]">
          {/* The panel's surface fades on its own layer, so the morphing
              image is never inside an element whose opacity is animating. */}
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-background shadow-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <button
            type="button"
            onClick={close}
            className="absolute top-3 right-3 z-20 grid size-9 place-items-center bg-background/90 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </button>

          <MotionConfig reducedMotion="user" transition={MORPH}>
            <motion.div
              layoutId={layoutId(product.id)}
              data-slot="product-quick-view-media"
              className="relative aspect-[4/5] overflow-hidden bg-secondary"
            >
              <div className="absolute inset-0">{color?.image ?? product.image}</div>
            </motion.div>
          </MotionConfig>

          <motion.div
            className="relative flex flex-col p-6 sm:p-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {product.brand ? (
              <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                {product.brand}
              </p>
            ) : null}
            <h2 id={titleId} className="mt-1 text-3xl leading-tight">
              {product.name}
            </h2>
            <PriceTag
              price={product.price}
              compareAt={product.compareAt}
              currency={currency}
              locale={locale}
              className="mt-3"
            />

            {product.colors?.length ? (
              <div className="mt-6">
                <p className="text-xs text-muted-foreground">
                  Colour: <span className="text-foreground">{color?.name}</span>
                </p>
                <div role="group" aria-label="Colour" className="mt-2 flex gap-2">
                  {product.colors.map((c, i) => (
                    <button
                      key={c.name}
                      type="button"
                      aria-label={c.name}
                      aria-pressed={i === colorIndex}
                      onClick={() => {
                        setColorIndex(i);
                        setAddState("idle");
                      }}
                      className={cn(
                        "size-6 border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        i === colorIndex
                          ? "border-foreground ring-1 ring-foreground ring-offset-2 ring-offset-background"
                          : "border-foreground/20 hover:border-foreground/50",
                      )}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {renderDetails ? <div className="mt-6 text-sm">{renderDetails(product)}</div> : null}

            <div className="mt-auto flex flex-col gap-3 pt-8">
              {onAddToBag ? (
                <Button
                  type="button"
                  onClick={addToBag}
                  disabled={addState === "pending"}
                  className="h-11 w-full"
                >
                  {addState === "added" ? (
                    <>
                      <Check className="size-4" aria-hidden /> Added to bag
                    </>
                  ) : addState === "pending" ? (
                    "Adding…"
                  ) : (
                    "Add to bag"
                  )}
                </Button>
              ) : null}
              <a
                href={product.href}
                className="inline-flex items-center gap-1.5 self-start text-sm underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                {detailsLabel} <ArrowRight className="size-3.5" aria-hidden />
              </a>
              <span className="sr-only" role="status" aria-live="polite">
                {addState === "added" ? `${product.name} added to bag` : ""}
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </dialog>
  );
}
