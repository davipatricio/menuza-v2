"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { MotionConfig, motion, useReducedMotion, type Transition } from "motion/react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "cn";

/*
 * Product details — materials, care, shipping, the maker — as an accordion.
 *
 *   <ProductDetailsAccordion sections={sections} />            one tag
 *
 *   <ProductDetailsAccordion defaultOpen={["materials"]}>      or composed
 *     <ProductDetailsSection id="materials" title="Materials" summary="Organic cotton">
 *       <ProductDetailsSpecs items={[["Shell", "Organic cotton"], ["Lining", "Linen"]]} />
 *     </ProductDetailsSection>
 *   </ProductDetailsAccordion>
 *
 * Built on your shadcn/ui Accordion — its triggers, ids and keyboard model —
 * with Motion driving the open and close: the panel grows to its real height
 * and settles, rather than snapping at the end of a CSS keyframe. Works on
 * either base, Radix or Base UI.
 */

export interface ProductDetailsSectionData {
  /** Stable id: the accordion value, and what `open` / `defaultOpen` refer to. */
  id: string;
  title: string;
  /**
   * One line shown on the closed row — "Organic cotton", "Free over $300".
   * The shopper gets the answer without opening the section, and the line
   * is always in the page for search engines and find-in-page.
   */
  summary?: React.ReactNode;
  content: React.ReactNode;
}

type AccordionContentProps = React.ComponentProps<typeof AccordionContent>;

type AccordionRootProps = React.ComponentProps<typeof Accordion>;

/** The same settle curve as product-quick-view: no bounce, an editorial ease. */
const MORPH: Transition = { duration: 0.45, ease: [0.2, 0, 0, 1] };

/* ─── context ──────────────────────────────────────────────────────────── */

export interface ProductDetailsAccordionContextValue {
  /** Ids of the open sections. */
  open: string[];
  setOpen: (open: string[]) => void;
  /** Opens or closes one section, leaving the others as they are. */
  toggle: (id: string) => void;
  isOpen: (id: string) => boolean;
  contentProps?: Omit<AccordionContentProps, "children">;
}

interface InternalContextValue extends ProductDetailsAccordionContextValue {
  /** A closing panel reports in once it has animated shut. */
  settle: (id: string) => void;
}

const ProductDetailsAccordionContext = React.createContext<InternalContextValue | null>(null);

function useInternalContext(): InternalContextValue {
  const context = React.useContext(ProductDetailsAccordionContext);

  if (!context) {
    throw new Error("useProductDetailsAccordion must be used within <ProductDetailsAccordion>.");
  }

  return context;
}

/** For your own parts inside a <ProductDetailsAccordion> — an "Expand all", say. */
export function useProductDetailsAccordion(): ProductDetailsAccordionContextValue {
  const { open, setOpen, toggle, isOpen, contentProps } = useInternalContext();

  return { open, setOpen, toggle, isOpen, contentProps };
}

const subscribe = () => () => {};

/**
 * False while hydrating server HTML, true for anything rendered after. A panel
 * that was open in the server's HTML is already at full height, so it must
 * not animate in; one opened later must.
 */
function useHydrated() {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const controlled = value !== undefined;

  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setUncontrolled(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [controlled ? value : uncontrolled, set] as const;
}

/* ─── root ─────────────────────────────────────────────────────────────── */

export interface ProductDetailsAccordionProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "dir" | "onChange"
> {
  /** Renders one section each when there are no children. */
  sections?: ProductDetailsSectionData[];
  /** Open on first render. Defaults to the first section. */
  defaultOpen?: string[];
  open?: string[];
  onOpenChange?: (open: string[]) => void;
  /**
   * Passed to every AccordionContent. To keep closed panels in the page —
   * collapsed, inert, still readable by crawlers — pass `{ forceMount: true }`
   * on Radix or `{ keepMounted: true }` on Base UI.
   */
  contentProps?: Omit<AccordionContentProps, "children">;
}

export function ProductDetailsAccordion({
  sections,
  defaultOpen,
  open: openProp,
  onOpenChange,
  contentProps,
  className,
  children,
  ...props
}: ProductDetailsAccordionProps) {
  const [open, setOpen] = useControllableState(
    openProp,
    defaultOpen ?? (sections?.[0] ? [sections[0].id] : []),
    onOpenChange,
  );

  // A section that closes stays in the accordion's value until its panel has
  // animated shut — otherwise the primitive unmounts it mid-animation. Derived
  // during render, so it also catches `open` changing from outside.
  const [closing, setClosing] = React.useState<string[]>([]);
  const [previous, setPrevious] = React.useState(open);

  if (previous !== open) {
    const removed = previous.filter((id) => !open.includes(id));
    setPrevious(open);
    setClosing((current) => [
      ...current.filter((id) => !open.includes(id)),
      ...removed.filter((id) => !current.includes(id)),
    ]);
  }

  const settle = React.useCallback(
    (id: string) => setClosing((current) => current.filter((c) => c !== id)),
    [],
  );

  const context = React.useMemo<InternalContextValue>(
    () => ({
      open,
      setOpen,
      toggle: (id) => setOpen(open.includes(id) ? open.filter((o) => o !== id) : [...open, id]),
      isOpen: (id) => open.includes(id),
      contentProps,
      settle,
    }),
    [open, setOpen, contentProps, settle],
  );

  // The primitive only ever sees a controlled value — the open sections, plus
  // any still animating shut — and each section's trigger does the toggling.
  // Base UI needs `multiple` to keep more than one panel open; the value stays
  // controlled here, so no `onValueChange` is wired.
  const rootProps: AccordionRootProps = {
    multiple: true,
    value: [...open, ...closing.filter((id) => !open.includes(id))],
  };

  if (!children && !sections?.length) return null;

  return (
    <ProductDetailsAccordionContext.Provider value={context}>
      <MotionConfig reducedMotion="user">
        <Accordion {...rootProps} className={cn("w-full", className)} {...props}>
          {children ??
            sections?.map((section) => (
              <ProductDetailsSection
                key={section.id}
                id={section.id}
                title={section.title}
                summary={section.summary}
              >
                {section.content}
              </ProductDetailsSection>
            ))}
        </Accordion>
      </MotionConfig>
    </ProductDetailsAccordionContext.Provider>
  );
}

/* ─── parts ────────────────────────────────────────────────────────────── */

export interface ProductDetailsSectionProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title" | "defaultValue" | "dir"
> {
  id: string;
  title: React.ReactNode;
  summary?: React.ReactNode;
}

/** One ruled row: a tracked-out title, its summary, and the panel. */
export function ProductDetailsSection({
  id,
  title,
  summary,
  className,
  children,
  ...props
}: ProductDetailsSectionProps) {
  const { isOpen, toggle, contentProps, settle } = useInternalContext();
  const hydrated = useHydrated();
  const reduce = useReducedMotion();
  const expanded = isOpen(id);
  const transition = reduce ? { duration: 0 } : MORPH;

  return (
    <AccordionItem
      value={id}
      data-section={id}
      // Rules above every row and below the last: a custom part placed before
      // the first section (an "Expand all") sits clear of the top rule.
      className={cn("border-t border-b-0 last:border-b", className)}
      {...props}
    >
      <AccordionTrigger
        onClick={() => toggle(id)}
        // Our chevron turns with the section; the stock icon is hidden.
        className="items-center gap-4 py-4 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:hidden [&>svg]:hidden"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <span className="text-xs font-medium tracking-[0.14em] uppercase">{title}</span>
          {summary ? (
            <span
              data-slot="product-details-summary"
              className="min-w-0 text-left text-sm font-normal text-muted-foreground sm:text-right"
            >
              {summary}
            </span>
          ) : null}
        </span>
        <motion.span
          aria-hidden
          data-slot="product-details-chevron"
          className="grid size-4 shrink-0 place-items-center text-muted-foreground"
          initial={false}
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={transition}
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </AccordionTrigger>
      <AccordionContent
        {...contentProps}
        // The stock keyframes would animate the same height Motion does.
        // animationName, not the shorthand: Base UI sets it on this element
        // too, and React warns when a shorthand and a longhand are mixed.
        style={{ animationName: "none" }}
        className="h-auto p-0"
      >
        <motion.div
          data-slot="product-details-panel"
          className="overflow-hidden"
          initial={hydrated ? { height: 0, opacity: 0 } : false}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={transition}
          onAnimationComplete={() => {
            if (!expanded) settle(id);
          }}
          inert={!expanded}
        >
          <motion.div
            data-slot="product-details-body"
            initial={hydrated ? { y: -8 } : false}
            animate={{ y: expanded ? 0 : -8 }}
            transition={transition}
            className="max-w-prose pb-5 text-sm leading-[1.7] text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground"
          >
            {children}
          </motion.div>
        </motion.div>
      </AccordionContent>
    </AccordionItem>
  );
}

export interface ProductDetailsSpecsProps extends React.HTMLAttributes<HTMLDListElement> {
  /** Label and value pairs: `[["Dimensions", "38 × 42 × 14 cm"], …]`. */
  items: [label: string, value: React.ReactNode][];
}

/** Key facts as a definition list — labels muted, values in ink, aligned. */
export function ProductDetailsSpecs({ items, className, ...props }: ProductDetailsSpecsProps) {
  if (items.length === 0) return null;

  return (
    <dl
      data-slot="product-details-specs"
      className={cn("grid grid-cols-[minmax(0,9rem)_1fr] gap-x-6 gap-y-2 [&+*]:mt-4", className)}
      {...props}
    >
      {items.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-foreground tabular-nums">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
