"use client";

import * as React from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProductCard,
  type ProductCardProduct,
  type ProductCardProps,
} from "@/components/ecomcn/product-card";
import { cn } from "cn";

/*
 * A "pairs well with" rail under the product: the exact product card, never
 * a second, smaller one, on your shadcn Carousel.
 *
 *   <RelatedProducts products={related} onQuickAdd={addToBag} />
 *
 *   <RelatedProducts products={related} title="Complete the look">       or composed
 *     <RelatedProductsHeader />                       title, previous / next
 *     <RelatedProductsRail renderCard={(p) => <ProductCard product={p} density="compact" />} />
 *     <RelatedProductsProgress />
 *   </RelatedProducts>
 *
 * The whole section is the Carousel, so the header's previous and next
 * buttons are the Carousel's own. The rail sits below the fold, so nothing in it loads with the page: the
 * cards — and their images — mount when the rail comes within a screen of
 * the viewport, fading in over skeletons of exactly their shape. A thin rule
 * under the rail shows how far along it is and grows as it scrolls.
 *
 * Everything the shadcn Carousel takes passes through: `opts` (Embla's
 * options — loop, dragFree, slidesToScroll…), `plugins` (autoplay, wheel
 * gestures), `setApi`, and `orientation`. Arrow keys move the rail when it
 * has focus, as on the Carousel.
 */

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

type CarouselProps = React.ComponentProps<typeof Carousel>;

/* ─── context ──────────────────────────────────────────────────────────── */

export interface RelatedProductsContextValue {
  products: ProductCardProduct[];
  title: React.ReactNode;
  headingId: string;
  /** True once the rail is near the viewport: cards and images are mounted. */
  inView: boolean;
  loading: boolean;
  /** How far the rail has scrolled, 0 to 1, and how much of it is on screen. */
  progress: number;
  visibleShare: number;
  /** The rail's Embla API, once the carousel has mounted. */
  api: CarouselApi | undefined;
  orientation: "horizontal" | "vertical";
  currency?: string;
  locale?: string;
  onQuickAdd?: (product: ProductCardProduct, colorIndex: number) => void | Promise<void>;
  cardProps?: Omit<ProductCardProps, "product">;
}

const RelatedProductsContext = React.createContext<RelatedProductsContextValue | null>(null);

export function useRelatedProducts() {
  const context = React.useContext(RelatedProductsContext);

  if (!context) {
    throw new Error("useRelatedProducts must be used within <RelatedProducts>.");
  }

  return context;
}

/* ─── root ─────────────────────────────────────────────────────────────── */

export interface RelatedProductsProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  products: ProductCardProduct[];
  title?: React.ReactNode;
  currency?: string;
  locale?: string;
  onQuickAdd?: (product: ProductCardProduct, colorIndex: number) => void | Promise<void>;
  /**
   * Passed to every card: `onWishlistChange` for the heart, `showColors={false}`
   * for products without colours, `density`.
   */
  cardProps?: Omit<ProductCardProps, "product">;
  /** Mount the cards with the page instead of near the viewport — above the fold. */
  eager?: boolean;
  /** How far ahead of the viewport the cards mount. Defaults to one screen. */
  rootMargin?: string;
  /** Placeholders while the products are being fetched. */
  loading?: boolean;
  /**
   * Embla's options, over the rail's own (`align: "start"`,
   * `containScroll: "trimSnaps"`): `loop`, `dragFree`, `slidesToScroll`…
   */
  opts?: CarouselProps["opts"];
  /** Embla plugins — `Autoplay()` from embla-carousel-autoplay, say. */
  plugins?: CarouselProps["plugins"];
  /** The Embla API, for your own controls. */
  setApi?: CarouselProps["setApi"];
  /** A vertical rail needs a height: set one on RelatedProductsRail. */
  orientation?: "horizontal" | "vertical";
}

export function RelatedProducts({
  products,
  title = "Pairs well with",
  currency,
  locale,
  onQuickAdd,
  cardProps,
  eager = false,
  rootMargin = "100% 0px",
  loading = false,
  opts,
  plugins,
  setApi: setApiProp,
  orientation = "horizontal",
  className,
  children,
  ...props
}: RelatedProductsProps) {
  const headingId = React.useId();
  const section = React.useRef<HTMLElement>(null);
  const [near, setNear] = React.useState(false);
  const [api, setApiState] = React.useState<CarouselApi>();

  const setApi = React.useCallback(
    (next: CarouselApi) => {
      setApiState(next);
      setApiProp?.(next);
    },
    [setApiProp],
  );

  const [scroll, setScroll] = React.useState({ progress: 0, visibleShare: 1 });

  React.useEffect(() => {
    if (eager || near) return;
    const node = section.current;

    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [eager, near, rootMargin]);

  React.useEffect(() => {
    if (!api) return;

    const update = () => {
      // The share of the track on screen, as a scrollbar thumb measures it:
      // the viewport's width over the slides' full run. Layout offsets, not
      // scrollWidth — Embla moves the track with a transform.
      const slides = api.slideNodes();
      const first = slides[0];
      const last = slides[slides.length - 1];
      const vertical = orientation === "vertical";

      const track =
        first && last
          ? vertical
            ? last.offsetTop + last.offsetHeight - first.offsetTop
            : last.offsetLeft + last.offsetWidth - first.offsetLeft
          : 0;

      const view = vertical ? api.rootNode().clientHeight : api.rootNode().clientWidth;
      setScroll({
        progress: Math.min(1, Math.max(0, api.scrollProgress())),
        visibleShare: track > 0 ? Math.min(1, view / track) : 1,
      });
    };

    update();
    api.on("scroll", update).on("reInit", update).on("resize", update);

    return () => {
      api.off("scroll", update).off("reInit", update).off("resize", update);
    };
  }, [api, orientation]);

  const context = React.useMemo<RelatedProductsContextValue>(
    () => ({
      products,
      title,
      headingId,
      inView: eager || near,
      loading,
      progress: scroll.progress,
      visibleShare: scroll.visibleShare,
      api,
      orientation,
      currency,
      locale,
      onQuickAdd,
      cardProps,
    }),
    [
      products,
      title,
      headingId,
      eager,
      near,
      loading,
      scroll,
      api,
      orientation,
      currency,
      locale,
      onQuickAdd,
      cardProps,
    ],
  );

  // Nothing related: the section goes, rather than an empty rail.
  if (!loading && products.length === 0) return null;

  return (
    <RelatedProductsContext.Provider value={context}>
      <MotionConfig reducedMotion="user">
        <section
          ref={section}
          aria-labelledby={headingId}
          aria-busy={loading || undefined}
          data-slot="related-products"
          className={cn("w-full", className)}
          {...props}
        >
          {/* The whole section is the carousel, so the header can hold its
              previous and next buttons. Snaps a card at a time. */}
          <Carousel
            setApi={setApi}
            opts={{ align: "start", containScroll: "trimSnaps", ...opts }}
            plugins={plugins}
            orientation={orientation}
            aria-labelledby={headingId}
          >
            {children ?? (
              <>
                <RelatedProductsHeader />
                <RelatedProductsRail />
                <RelatedProductsProgress />
              </>
            )}
          </Carousel>
        </section>
      </MotionConfig>
    </RelatedProductsContext.Provider>
  );
}

/* ─── parts ────────────────────────────────────────────────────────────── */

/** The Carousel's own buttons, squared off to sit in the header's rule. */
const ARROW = "static size-9 translate-x-0 translate-y-0 rounded-none shadow-none";

/** The title, ruled, with the Carousel's previous and next buttons on the right. */
export function RelatedProductsHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { title, headingId, products, loading, inView } = useRelatedProducts();
  // Spread only when there is nothing to scroll yet: passing `disabled`
  // at all would override the Carousel's own can-scroll state.
  const idle = loading || !inView || products.length < 2 ? { disabled: true } : {};

  return (
    <div
      data-slot="related-products-header"
      className={cn("flex items-end justify-between gap-4 border-b pb-4", className)}
      {...props}
    >
      <h2 id={headingId} className="text-2xl">
        {title}
      </h2>
      <div className="flex gap-2">
        {/* The Carousel turns these a quarter for a vertical rail. */}
        <CarouselPrevious {...idle} className={ARROW} />
        <CarouselNext {...idle} className={ARROW} />
      </div>
    </div>
  );
}

export interface RelatedProductsRailProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Your own card for each product — still the product card, composed your way. */
  renderCard?: (product: ProductCardProduct) => React.ReactNode;
  /** Placeholders shown while loading, or before the rail is near. Defaults to 4. */
  skeletonCount?: number;
}

/**
 * The cards: drag, swipe, or the arrow keys once the rail has focus. Two and
 * a bit cards on a phone — the cut-off one says there are more — four on a
 * desktop.
 */
export function RelatedProductsRail({
  renderCard,
  skeletonCount = 4,
  className,
  ...props
}: RelatedProductsRailProps) {
  const { products, inView, loading, currency, locale, onQuickAdd, cardProps, orientation } =
    useRelatedProducts();

  const vertical = orientation === "vertical";
  const reduce = useReducedMotion();
  const ready = inView && !loading;
  const slides = ready ? products : Array.from({ length: skeletonCount }, () => null);

  return (
    <div
      data-slot="related-products-rail"
      // The Carousel's viewport clips. Started 4px early on the left — and
      // the track 4px late — a selected swatch's ring and a focus ring on
      // the first card are not cut off, while the cards still line up with
      // the header. py-1 does the same at the top and bottom.
      className={cn(
        "pt-5",
        vertical ? "[&>[data-slot=carousel-content]]:h-full" : "-ml-1",
        className,
      )}
      {...props}
    >
      <CarouselContent className={vertical ? "-mt-5 h-full py-1" : "-ml-4 py-1"}>
        {slides.map((product, i) => (
          <CarouselItem
            key={product?.id ?? `skeleton-${i}`}
            className={vertical ? "basis-auto pt-5" : "basis-[44%] pl-5 sm:basis-1/3 lg:basis-1/4"}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {product ? (
                <motion.div
                  key="card"
                  initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduce ? { duration: 0.15 } : { ...MORPH, delay: Math.min(i, 4) * 0.05 }
                  }
                >
                  {renderCard ? (
                    renderCard(product)
                  ) : (
                    <ProductCard
                      currency={currency}
                      locale={locale}
                      onQuickAdd={onQuickAdd}
                      {...cardProps}
                      product={product}
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  <CardSkeleton />
                </motion.div>
              )}
            </AnimatePresence>
          </CarouselItem>
        ))}
      </CarouselContent>
    </div>
  );
}

/** Same box as the product card — image ratio and text bars — so nothing jumps. */
function CardSkeleton() {
  return (
    <div aria-hidden data-slot="related-products-skeleton">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <Skeleton className="mt-3.5 h-3 w-16 rounded-none" />
      <Skeleton className="mt-2 h-5 w-3/4 rounded-none" />
      <Skeleton className="mt-2 h-3 w-14 rounded-none" />
    </div>
  );
}

/**
 * A hairline under the rail with a heavier segment for the part on screen.
 * It is as long as the share of cards in view and slides as the rail
 * scrolls — a scrollbar's information, without a scrollbar.
 */
export function RelatedProductsProgress({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { progress, visibleShare, products, inView } = useRelatedProducts();
  const reduce = useReducedMotion();

  if (!inView || products.length < 2 || visibleShare >= 1) return null;
  const width = Math.max(0.12, visibleShare);

  return (
    <div
      aria-hidden
      data-slot="related-products-progress"
      className={cn("relative mt-8 h-px bg-border", className)}
      {...props}
    >
      <motion.span
        className="absolute -top-px left-0 h-[3px] origin-left bg-foreground"
        initial={false}
        animate={{ width: `${width * 100}%`, left: `${progress * (1 - width) * 100}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: MORPH.ease }}
      />
    </div>
  );
}
