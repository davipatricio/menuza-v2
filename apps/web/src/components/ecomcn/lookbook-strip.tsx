"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

/*
 * A campaign photo you can shop: numbered hotspots on the image, each
 * opening the product it points at, and the same products listed under it.
 *
 *   <LookbookStrip
 *     image={<img src="/look.jpg" alt="…" />}
 *     mobileImage={<img src="/look-portrait.jpg" alt="…" />}
 *     hotspots={[{ id: "coat", x: 38, y: 42, mobile: { x: 52, y: 30 }, product }]}
 *   />
 *
 * Hotspots are hairline rings, not filled dots — they read as annotation.
 * Positions are percentages of the image, so they hold at any width; a
 * phone usually gets a different crop, so each hotspot can carry its own
 * `mobile` position for `mobileImage`. A hotspot opens on hover with a
 * pointer, and on tap or Enter otherwise; the card grows out of the
 * hotspot and folds back into it (Motion; a fade under reduced motion),
 * kept open until the fold has played. Hovering a product in the list
 * marks its hotspot. Your shadcn Popover does the positioning and focus.
 */

export interface LookbookProduct {
  name: string;
  href: string;
  /** Major units: 420 for $420. */
  price: number;
  /** Was-price; struck through when higher. */
  compareAt?: number;
  brand?: string;
  /** Already rendered — a thumbnail for the card. */
  image?: React.ReactNode;
}

export interface LookbookHotspot {
  id: string;
  /** Percent from the left of `image`, 0–100. */
  x: number;
  /** Percent from the top of `image`, 0–100. */
  y: number;
  /** Where it sits on `mobileImage`, whose crop differs. Defaults to x / y. */
  mobile?: { x: number; y: number };
  product: LookbookProduct;
}

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

const subscribeNothing = () => () => {};

export interface LookbookStripProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Already rendered; it fills the strip. */
  image: React.ReactNode;
  /** A different crop for phones (below md). Give it `loading="lazy"` so only one loads. */
  mobileImage?: React.ReactNode;
  hotspots: LookbookHotspot[];
  title?: React.ReactNode;
  /** The strip's shape from md up. Defaults to "16 / 7". */
  aspectRatio?: string;
  /** On a phone. Defaults to "4 / 5". */
  mobileAspectRatio?: string;
  currency?: string;
  /** `undefined` follows the visitor's locale, once hydrated. */
  locale?: string;
  /** Lists the products under the image. Defaults to true. */
  showList?: boolean;
}

export function LookbookStrip({
  image,
  mobileImage,
  hotspots,
  title,
  aspectRatio = "16 / 7",
  mobileAspectRatio = "4 / 5",
  currency = "USD",
  locale: localeProp,
  showList = true,
  className,
  ...props
}: LookbookStripProps) {
  const hydrated = React.useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const locale = localeProp ?? (hydrated ? undefined : "en-US");

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );

  const headingId = React.useId();
  const [marked, setMarked] = React.useState<string | null>(null);

  return (
    <MotionConfig reducedMotion="user">
      <section
        data-slot="lookbook-strip"
        aria-labelledby={title ? headingId : undefined}
        className={cn("flex flex-col gap-5", className)}
        {...props}
      >
        {title ? (
          <h2 id={headingId} className="border-b pb-4 text-2xl">
            {title}
          </h2>
        ) : null}

        <div
          data-slot="lookbook-strip-media"
          className="relative isolate [aspect-ratio:var(--lookbook-mobile-ratio)] overflow-hidden bg-secondary md:[aspect-ratio:var(--lookbook-ratio)]"
          style={
            {
              "--lookbook-ratio": aspectRatio,
              "--lookbook-mobile-ratio": mobileImage ? mobileAspectRatio : aspectRatio,
            } as React.CSSProperties
          }
        >
          <div
            className={cn(
              "absolute inset-0 -z-10 [&>img]:size-full [&>img]:object-cover",
              mobileImage && "max-md:hidden",
            )}
          >
            {image}
          </div>
          {mobileImage ? (
            <div className="absolute inset-0 -z-10 md:hidden [&>img]:size-full [&>img]:object-cover">
              {mobileImage}
            </div>
          ) : null}

          {hotspots.map((spot, i) => (
            <Hotspot
              key={spot.id}
              spot={spot}
              index={i}
              money={money}
              marked={marked === spot.id}
            />
          ))}
        </div>

        {showList ? (
          <ol
            data-slot="lookbook-strip-list"
            aria-label="In this look"
            className="grid border-t sm:grid-cols-2 lg:grid-cols-4"
          >
            {hotspots.map((spot, i) => (
              <li
                key={spot.id}
                className="border-b sm:odd:border-r lg:border-r lg:[&:nth-child(4n)]:border-r-0"
              >
                <a
                  href={spot.product.href}
                  onPointerEnter={() => setMarked(spot.id)}
                  onPointerLeave={() => setMarked(null)}
                  onFocus={() => setMarked(spot.id)}
                  onBlur={() => setMarked(null)}
                  className="group flex items-baseline gap-3 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm underline-offset-4 group-hover:underline">
                      {spot.product.name}
                    </span>
                    {spot.product.brand ? (
                      <span className="text-[12.5px] text-muted-foreground">
                        {spot.product.brand}
                      </span>
                    ) : null}
                  </span>
                  <Price product={spot.product} money={money} />
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </MotionConfig>
  );
}

function Price({ product, money }: { product: LookbookProduct; money: Intl.NumberFormat }) {
  const sale = product.compareAt !== undefined && product.compareAt > product.price;

  return (
    <span className="flex shrink-0 items-baseline gap-1.5 text-sm tabular-nums">
      <span>{money.format(product.price)}</span>
      {sale ? (
        <s className="text-[12.5px] text-muted-foreground">
          <span className="sr-only">was </span>
          {money.format(product.compareAt!)}
        </s>
      ) : null}
    </span>
  );
}

/** One ring on the photo, and the card it opens. */
function Hotspot({
  spot,
  index,
  money,
  marked,
}: {
  spot: LookbookHotspot;
  index: number;
  money: Intl.NumberFormat;
  marked: boolean;
}) {
  const reduce = useReducedMotion();
  // `open` is what was asked for; `mounted` keeps the Popover open until
  // the fold back into the hotspot has played.
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  if (open && !mounted) setMounted(true);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };

  // A short grace, so the pointer can cross from the ring to the card.
  const hideSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };

  // Hover is for a mouse; touch and pens open it with a tap, through the Popover.
  const onPointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") show();
  };

  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") hideSoon();
  };

  const at = spot.mobile ?? spot;

  const position = {
    "--hx": `${spot.x}%`,
    "--hy": `${spot.y}%`,
    "--mx": `${at.x}%`,
    "--my": `${at.y}%`,
  } as React.CSSProperties;

  const sale = spot.product.compareAt !== undefined && spot.product.compareAt > spot.product.price;

  return (
    <Popover open={mounted} onOpenChange={(next: boolean) => (next ? show() : setOpen(false))}>
      <PopoverTrigger
        data-slot="lookbook-strip-hotspot"
        aria-label={`${index + 1}: ${spot.product.name}, ${money.format(spot.product.price)}${sale ? " on sale" : ""}`}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={position}
        className={cn(
          "absolute top-[var(--my)] left-[var(--mx)] grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none md:top-[var(--hy)] md:left-[var(--hx)]",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
        )}
      >
        {/* The hairline ring, with the number it shares with the list. */}
        <span
          aria-hidden
          className={cn(
            "grid size-7 place-items-center rounded-full border border-white/95 bg-black/15 font-mono text-[10.5px] text-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)] backdrop-blur-[2px] transition-transform duration-300",
            (marked || open) && "scale-125 bg-black/35",
          )}
        >
          {index + 1}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-white/60 [animation-duration:2.4s] motion-safe:animate-ping"
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={10}
        // Motion runs the open and close; the primitive's keyframes would fight it.
        className="w-auto animate-none! border-0 bg-transparent p-0 shadow-none"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={
            open ? { opacity: 1, scale: 1 } : reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }
          }
          transition={reduce ? { duration: 0.15 } : MORPH}
          onAnimationComplete={() => {
            if (!open) setMounted(false);
          }}
          // Grow from the side the hotspot is on: both bases set an origin variable.
          style={{
            transformOrigin:
              "var(--radix-popover-content-transform-origin, var(--transform-origin, center bottom))",
          }}
          className="flex w-64 gap-3 border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          {spot.product.image ? (
            <span className="relative size-16 shrink-0 overflow-hidden bg-secondary [&>img]:size-full [&>img]:object-cover">
              {spot.product.image}
            </span>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {spot.product.brand ? (
              <span className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {spot.product.brand}
              </span>
            ) : null}
            <span className="text-sm leading-snug font-medium">{spot.product.name}</span>
            <Price product={spot.product} money={money} />
            <a
              href={spot.product.href}
              className="mt-1 inline-flex items-center gap-1 self-start text-[12.5px] underline underline-offset-4 hover:text-muted-foreground"
            >
              View product <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </span>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
