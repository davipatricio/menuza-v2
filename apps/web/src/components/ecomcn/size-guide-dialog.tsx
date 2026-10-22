"use client";

import * as React from "react";
import { Ruler, X } from "lucide-react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/*
 * A size guide, opened from the size label:
 *
 *   <SizeGuideDialog columns={["Chest", "Waist"]} rows={rows} selectedSize="M" />
 *
 *   <SizeGuideDialog columns={columns} rows={rows}>          or composed
 *     <SizeGuideTrigger>Size & fit</SizeGuideTrigger>
 *     <SizeGuideContent>
 *       <SizeGuideUnitToggle />
 *       <SizeGuideTable />
 *       <HowToMeasure />                                     your own part
 *     </SizeGuideContent>
 *   </SizeGuideDialog>
 *
 * Built on your shadcn/ui Dialog and Table. The panel morphs out of the link
 * that opened it and back into it on close, driven by Motion; with reduced
 * motion it simply fades. The parts share the unit and the selected size
 * through context; `useSizeGuide()` reads them.
 */

export type SizeGuideUnit = "cm" | "in";

/**
 * One cell: a measurement in `baseUnit`, a `[min, max]` range, or text shown
 * as-is — "EU 38", "UK 10" — which is never converted.
 */
export type SizeGuideValue = number | [min: number, max: number] | string;

export interface SizeGuideRow {
  size: string;
  /** One per column, in column order. */
  values: SizeGuideValue[];
}

const CM_PER_INCH = 2.54;

/** Inches to the nearest half, centimetres to the whole — how tapes are read. */
function convert(value: number, from: SizeGuideUnit, to: SizeGuideUnit) {
  if (from === to) return value;

  return to === "in" ? Math.round((value / CM_PER_INCH) * 2) / 2 : Math.round(value * CM_PER_INCH);
}

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

/** Scrolls, without drawing a scrollbar. Edge fades say there is more. */
const NO_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/* ─── context ──────────────────────────────────────────────────────────── */

export interface SizeGuideContextValue {
  columns: string[];
  rows: SizeGuideRow[];
  unit: SizeGuideUnit;
  setUnit: (unit: SizeGuideUnit) => void;
  /** The unit `rows` are written in. */
  baseUnit: SizeGuideUnit;
  selectedSize?: string;
  /** A cell, converted to the current unit and formatted for the locale. */
  format: (value: SizeGuideValue) => string;
  title: React.ReactNode;
  description: React.ReactNode;
}

const SizeGuideContext = React.createContext<SizeGuideContextValue | null>(null);

export function useSizeGuide() {
  const context = React.useContext(SizeGuideContext);

  if (!context) {
    throw new Error("useSizeGuide must be used within <SizeGuideDialog>.");
  }

  return context;
}

/** The morph's bookkeeping. Internal: nothing here is part of the API. */
interface MorphContextValue {
  /** The element the panel grows out of, and shrinks back into. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Closed as far as the shopper is concerned, still on screen animating out. */
  closing: boolean;
  /** Called once the exit has played: the dialog really closes. */
  finishClose: () => void;
}

const MorphContext = React.createContext<MorphContextValue | null>(null);

function useMorph() {
  const context = React.useContext(MorphContext);

  if (!context) {
    throw new Error("Size guide parts must be used within <SizeGuideDialog>.");
  }

  return context;
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

/** Whether a scroller has more to show past its start or end edge. */
function useOverflow(axis: "x" | "y") {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const node = ref.current;

    if (!node) return;

    const update = () => {
      const offset = axis === "x" ? node.scrollLeft : node.scrollTop;
      const size = axis === "x" ? node.clientWidth : node.clientHeight;
      const total = axis === "x" ? node.scrollWidth : node.scrollHeight;
      const next = { start: offset > 1, end: offset + size < total - 1 };
      setEdges((current) =>
        current.start === next.start && current.end === next.end ? current : next,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);

    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", update, { passive: true });

    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [axis]);

  return [ref, edges] as const;
}

/* ─── root ─────────────────────────────────────────────────────────────── */

export interface SizeGuideDialogProps {
  /** Measurement names, left to right: "Chest", "Waist", "Hip". */
  columns: string[];
  rows: SizeGuideRow[];
  /** The unit `rows` are written in. Defaults to centimetres. */
  baseUnit?: SizeGuideUnit;
  unit?: SizeGuideUnit;
  /** Defaults to `baseUnit`. */
  defaultUnit?: SizeGuideUnit;
  onUnitChange?: (unit: SizeGuideUnit) => void;
  /** The size picked in the buy box. Its row is marked, and announced. */
  selectedSize?: string;
  locale?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** "Runs small — size up." Shown under the table in the default layout. */
  fitNote?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trigger and content parts. Omit for the default layout. */
  children?: React.ReactNode;
}

export function SizeGuideDialog({
  columns,
  rows,
  baseUnit = "cm",
  unit: unitProp,
  defaultUnit,
  onUnitChange,
  selectedSize,
  locale: localeProp,
  title = "Size guide",
  description = "Body measurements. Measure over light clothing, with the tape level and snug.",
  fitNote,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: SizeGuideDialogProps) {
  const locale = useFormatLocale(localeProp);
  const [unit, setUnit] = useControllableState(unitProp, defaultUnit ?? baseUnit, onUnitChange);
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);

  // The primitive stays open until the exit morph has played; `open` is what
  // the shopper asked for. Derived during render, so a controlled `open`
  // that flips from outside animates the same way.
  const [mounted, setMounted] = React.useState(open);

  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;

  const anchorRef = React.useRef<HTMLElement | null>(null);
  const finishClose = React.useCallback(() => setMounted(false), []);

  const onPrimitiveOpenChange = (next: boolean) => {
    // Escape pressed twice, or the overlay clicked mid-exit: already closing.
    if (next === open) return;

    if (next && !anchorRef.current) {
      // A trigger of your own: grow from whatever opened the dialog.
      const active = document.activeElement;
      anchorRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }

    setOpen(next);
  };

  const context = React.useMemo<SizeGuideContextValue>(() => {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const one = (n: number) => number.format(convert(n, baseUnit, unit));

    return {
      columns,
      rows,
      unit,
      setUnit,
      baseUnit,
      selectedSize,
      format: (value) =>
        typeof value === "string"
          ? value
          : Array.isArray(value)
            ? `${one(value[0])}–${one(value[1])}`
            : one(value),
      title,
      description,
    };
  }, [columns, rows, unit, setUnit, baseUnit, selectedSize, locale, title, description]);

  const morph = React.useMemo<MorphContextValue>(
    () => ({ anchorRef, closing, finishClose }),
    [closing, finishClose],
  );

  return (
    <SizeGuideContext.Provider value={context}>
      <MorphContext.Provider value={morph}>
        <Dialog open={mounted} onOpenChange={onPrimitiveOpenChange}>
          {children ?? (
            <>
              <SizeGuideTrigger />
              <SizeGuideContent>
                <SizeGuideUnitToggle />
                <SizeGuideTable />
                {fitNote ? <SizeGuideNote>{fitNote}</SizeGuideNote> : null}
              </SizeGuideContent>
            </>
          )}
        </Dialog>
      </MorphContext.Provider>
    </SizeGuideContext.Provider>
  );
}

/* ─── parts ────────────────────────────────────────────────────────────── */

/** A quiet text link, sized to sit beside the "Size" label. */
export function SizeGuideTrigger({
  className,
  children = "Size guide",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { anchorRef } = useMorph();

  return (
    <DialogTrigger
      className={cn(
        "inline-flex items-center rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {/* The morph's origin. A span, not a ref on the trigger: the trigger
          is your primitive's, and refs reach it differently on each base. */}
      <span
        ref={(node) => {
          anchorRef.current = node;
        }}
        className="inline-flex items-center gap-1.5"
      >
        <Ruler className="size-4" aria-hidden />
        {children}
      </span>
    </DialogTrigger>
  );
}

/**
 * The panel: title and description, then your parts in a body that scrolls
 * without a scrollbar. It grows out of the trigger, and shrinks back into it.
 */
export function SizeGuideContent({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { title, description } = useSizeGuide();
  const [body, edges] = useOverflow("y");

  return (
    <DialogContent
      showCloseButton={false}
      // The primitive only positions and traps focus. Its surface, padding
      // and CSS keyframes are switched off: the surface is ours, and Motion
      // plays the open and the close.
      className="animate-none! gap-0 rounded-none border-0 bg-transparent p-0 shadow-none ring-0 transition-none! sm:max-w-[min(48rem,calc(100%-2rem))]"
    >
      <MorphPanel>
        <DialogHeader className="shrink-0 gap-2 border-b px-5 pt-6 pr-16 pb-5 text-left sm:px-8 sm:pt-8">
          <DialogTitle className="text-xl font-medium tracking-tight">{title}</DialogTitle>
          <DialogDescription className="max-w-prose text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={body}
            data-slot="size-guide-body"
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:pb-8",
              NO_SCROLLBAR,
              className,
            )}
          >
            {children}
          </div>
          <EdgeFade side="bottom" visible={edges.end} />
        </div>

        <DialogClose className="absolute top-3 right-3 grid size-9 place-items-center text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:top-5 sm:right-5">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close</span>
        </DialogClose>
      </MorphPanel>
    </DialogContent>
  );
}

/**
 * The visible surface, and the morph. A container transform: the surface
 * starts as the trigger's box, scales out to its real size, and only then do
 * its contents fade in — they are never seen squashed. Closing runs it back.
 */
function MorphPanel({ children }: { children: React.ReactNode }) {
  const { anchorRef, closing, finishClose } = useMorph();
  const reduce = useReducedMotion();
  const surface = React.useRef<HTMLDivElement>(null);
  const contents = React.useRef<HTMLDivElement>(null);
  const entered = React.useRef(false);

  // A layout effect, inside the portal: this runs once the panel is in the
  // document and before the browser paints it, so it never flashes full size.
  React.useLayoutEffect(() => {
    const panel = surface.current;
    const inner = contents.current;

    if (!panel || !inner) return;
    const overlay = findOverlay(panel);
    const running: AnimationPlaybackControls[] = [];
    let cancelled = false;

    if (!closing) {
      const from = reduce ? null : deltaTo(panel, anchorRef.current);

      if (!entered.current) {
        entered.current = true;

        // Paint the first frame now; Motion takes over on the next one.
        if (from) {
          panel.style.transform = `translate(${from.x}px, ${from.y}px) scale(${from.scaleX}, ${from.scaleY})`;
        } else {
          panel.style.opacity = "0";
        }

        inner.style.opacity = "0";
        running.push(
          from
            ? animate(
                panel,
                {
                  x: [from.x, 0],
                  y: [from.y, 0],
                  scaleX: [from.scaleX, 1],
                  scaleY: [from.scaleY, 1],
                },
                MORPH,
              )
            : animate(panel, reduce ? { opacity: [0, 1] } : { opacity: [0, 1], y: [8, 0] }, {
                duration: reduce ? 0.15 : 0.3,
                ease: MORPH.ease,
              }),
        );
      } else {
        // Reopened while still closing: turn around from wherever it is.
        running.push(animate(panel, { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }, MORPH));

        if (overlay) running.push(animate(overlay, { opacity: 1 }, { duration: 0.2 }));
      }

      running.push(
        animate(inner, { opacity: 1 }, { duration: 0.25, delay: from ? 0.2 : 0, ease: "easeOut" }),
      );
    } else {
      const to = reduce ? null : deltaTo(panel, anchorRef.current);
      running.push(animate(inner, { opacity: 0 }, { duration: 0.12, ease: "easeIn" }));

      if (to) {
        running.push(
          animate(
            panel,
            { x: to.x, y: to.y, scaleX: to.scaleX, scaleY: to.scaleY },
            { ...MORPH, duration: 0.38, delay: 0.06 },
          ),
          // The last of it fades, so the box hands over to the link.
          animate(panel, { opacity: 0 }, { duration: 0.14, delay: 0.3 }),
        );
      } else {
        running.push(
          animate(panel, reduce ? { opacity: 0 } : { opacity: 0, y: 8 }, {
            duration: reduce ? 0.15 : 0.2,
          }),
        );
      }

      if (overlay) running.push(animate(overlay, { opacity: 0 }, { duration: 0.3, delay: 0.1 }));

      // A fallback, should a frame never come (a background tab, say).
      const fallback = window.setTimeout(() => !cancelled && finishClose(), 800);
      Promise.all(running.map((animation) => animation.finished)).then(() => {
        window.clearTimeout(fallback);

        if (!cancelled) finishClose();
      });

      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
        running.forEach((animation) => animation.stop());
      };
    }

    return () => {
      cancelled = true;
      running.forEach((animation) => animation.stop());
    };
    // Runs on open and on close; `reduce` is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  return (
    <div
      ref={surface}
      data-slot="size-guide-panel"
      // min-w-0: the primitive's content box may be a grid, and a grid item
      // grows to its widest content — the table — past the screen's edge.
      className="relative w-full min-w-0 origin-center border bg-background text-foreground shadow-2xl"
    >
      <div ref={contents} className="flex max-h-[min(calc(100dvh-2rem),56rem)] flex-col">
        {children}
      </div>
    </div>
  );
}

/**
 * The move and scale that lay the panel over `anchor`. Null when there is no
 * anchor on screen — then the panel rises and fades instead.
 */
function deltaTo(panel: HTMLElement, anchor: HTMLElement | null) {
  if (!anchor?.isConnected) return null;
  const a = anchor.getBoundingClientRect();

  if (a.width === 0 || a.height === 0) return null;
  // Untransformed size: the panel may be mid-morph when this runs.
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const box = panel.parentElement?.getBoundingClientRect();

  if (!box || width === 0 || height === 0) return null;
  // The panel fills its positioned parent, which is never transformed by us.
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;

  return {
    x: a.left + a.width / 2 - centerX,
    y: a.top + a.height / 2 - centerY,
    scaleX: a.width / width,
    scaleY: a.height / height,
  };
}

/** The dialog's overlay: a sibling of the content, somewhere up the portal. */
function findOverlay(panel: HTMLElement) {
  const content = panel.closest<HTMLElement>('[data-slot="dialog-content"]');
  let node = content?.parentElement ?? null;

  while (node && node !== document.body) {
    const overlay = node.querySelector<HTMLElement>(':scope > [data-slot="dialog-overlay"]');

    if (overlay) return overlay;
    node = node.parentElement;
  }

  return null;
}

/** A soft edge over scrolled-away content, in place of a scrollbar. */
function EdgeFade({ side, visible }: { side: "bottom" | "right"; visible: boolean }) {
  return (
    <div
      aria-hidden
      data-slot="size-guide-fade"
      data-side={side}
      className={cn(
        "pointer-events-none absolute from-background to-transparent transition-opacity duration-200",
        side === "bottom"
          ? "inset-x-0 bottom-0 h-10 bg-gradient-to-t"
          : "inset-y-0 right-0 w-12 bg-gradient-to-l",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/** cm / in, as a pressed-button pair: two options do not need a menu. */
export function SizeGuideUnitToggle({ className }: { className?: string }) {
  const { unit, setUnit } = useSizeGuide();

  return (
    <div
      role="group"
      aria-label="Units"
      data-slot="size-guide-units"
      className={cn("flex w-fit items-center border", className)}
    >
      {(
        [
          ["cm", "Centimetres"],
          ["in", "Inches"],
        ] as const
      ).map(([key, name]) => (
        <button
          key={key}
          type="button"
          aria-pressed={unit === key}
          aria-label={name}
          onClick={() => setUnit(key)}
          className={cn(
            "h-8 min-w-11 px-3 text-xs font-medium tracking-[0.14em] uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            unit === key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

/**
 * Ruled, not striped. The size column stays put while the measurements
 * scroll sideways inside the table — never the page — on a narrow screen,
 * with a soft edge, not a scrollbar, saying there is more.
 */
export function SizeGuideTable({ className }: { className?: string }) {
  const { columns, rows, unit, selectedSize, format } = useSizeGuide();
  const [scroller, edges] = useOverflow("x");
  const unitName = unit === "cm" ? "centimetres" : "inches";

  return (
    <div
      data-slot="size-guide-table"
      // min-w-0: inside a flex or grid parent an item grows to its content —
      // without it the whole panel scrolls sideways instead of the table.
      className={cn("relative min-w-0 border-y", className)}
    >
      <div
        ref={scroller}
        role="region"
        aria-label={`Size chart, in ${unitName}`}
        // Focusable, so the chart scrolls from the keyboard too. A scrollable
        // region must be keyboard-reachable, so this is intentional.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className={cn(
          "overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          // The Table's own wrapper would scroll too; this region does it.
          "[&_[data-slot=table-container]]:overflow-visible",
          NO_SCROLLBAR,
        )}
      >
        {/* Separate borders, drawn on the cells: with collapsed borders the
            pinned size column paints over the row rules as it scrolls. */}
        <Table className="border-separate border-spacing-0 whitespace-nowrap [&_tbody_tr:last-child>*]:border-b-0 [&_td]:border-b [&_th]:border-b">
          <TableCaption className="sr-only">Body measurements in {unitName}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="col"
                className="sticky left-0 z-10 bg-background pr-6 pl-0 text-xs font-medium tracking-[0.14em] text-foreground uppercase"
              >
                Size
              </TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column}
                  scope="col"
                  className="text-right text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase last:pr-0"
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const selected = row.size === selectedSize;

              return (
                <TableRow
                  key={row.size}
                  data-state={selected ? "selected" : undefined}
                  aria-current={selected ? "true" : undefined}
                  className="group hover:bg-transparent data-[state=selected]:bg-muted"
                >
                  <TableHead
                    scope="row"
                    className="sticky left-0 z-10 bg-background pr-6 pl-0 font-medium text-foreground group-data-[state=selected]:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      {row.size}
                      {selected ? (
                        <span className="text-[11px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                          Selected
                        </span>
                      ) : null}
                    </span>
                  </TableHead>
                  {columns.map((column, i) => (
                    <TableCell key={column} className="text-right tabular-nums last:pr-0">
                      {row.values[i] === undefined ? "—" : format(row.values[i])}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <EdgeFade side="right" visible={edges.end} />
    </div>
  );
}

/** The fit note: one line of judgment under the numbers. */
export function SizeGuideNote({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="size-guide-note"
      className={cn("text-sm leading-relaxed text-foreground", className)}
      {...props}
    />
  );
}
