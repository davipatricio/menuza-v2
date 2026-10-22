import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "cn";

/*
 * The top of the home page: an oversized headline on the left, a campaign
 * image on the right with a product caption sitting on it.
 *
 *   <HeroEditorial
 *     eyebrow="Autumn / Winter"
 *     title="Made to be resoled."
 *     actions={<a href="/shop" className={buttonVariants({ size: "lg" })}>Shop the collection</a>}
 *     image={{ src: "/campaign.jpg", alt: "The Vester boot on a stone step", width: 1600, height: 2000 }}
 *     caption={{ title: "Vester Chelsea Boot", price: 420, href: "/p/vester" }}
 *   />
 *
 * A 1.05fr / 0.95fr split rather than 50/50 — the small imbalance is what
 * stops it looking like a template. The caption sits on the image, not
 * under it. The image is almost always the page's largest contentful paint,
 * so it loads eagerly with `fetchpriority="high"` inside a box with a real
 * aspect ratio, and the page never shifts when it arrives. No state, no
 * "use client": it renders on the server, so the image is in the first
 * HTML.
 */

export interface HeroImage {
  src: string;
  alt: string;
  srcSet?: string;
  /** Defaults to the hero's column: "(min-width: 1024px) 48vw, 100vw". */
  sizes?: string;
  width?: number;
  height?: number;
}

export interface HeroCaption {
  /** "Featured", "New in". */
  eyebrow?: string;
  title: string;
  /** Major units: 420 for $420. */
  price?: number;
  href?: string;
}

export interface HeroEditorialProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Your buttons or links. */
  actions?: React.ReactNode;
  image: HeroImage;
  /**
   * Render the image yourself — next/image with `priority`, say. You get
   * the props the block would put on its own <img>.
   */
  renderImage?: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string },
  ) => React.ReactNode;
  caption?: HeroCaption;
  currency?: string;
  /** Rendered on the server, so it can't follow the visitor: defaults to en-US. */
  locale?: string;
  /** The image box. Defaults to "4 / 5". */
  aspectRatio?: string;
  /** "h1" on a home page; "h2" when the page already has one. */
  headingLevel?: "h1" | "h2";
}

export function HeroEditorial({
  eyebrow,
  title,
  description,
  actions,
  image,
  renderImage,
  caption,
  currency = "USD",
  locale = "en-US",
  aspectRatio = "4 / 5",
  headingLevel = "h1",
  className,
  ...props
}: HeroEditorialProps) {
  const Heading = headingLevel;

  const imgProps = {
    src: image.src,
    alt: image.alt,
    srcSet: image.srcSet,
    sizes: image.sizes ?? "(min-width: 1024px) 48vw, 100vw",
    width: image.width,
    height: image.height,
    // The largest paint on the page: fetch it first, never lazily.
    fetchPriority: "high" as const,
    loading: "eager" as const,
    decoding: "async" as const,
    className: "absolute inset-0 size-full object-cover",
  };

  const price =
    caption?.price !== undefined
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(caption.price)
      : null;

  const captionBody = caption ? (
    <>
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          {caption.eyebrow ?? "Featured"}
        </span>
        <span className="text-sm font-medium">{caption.title}</span>
      </span>
      {price ? <span className="text-sm tabular-nums">{price}</span> : null}
      {caption.href ? (
        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 transition-transform group-hover/caption:translate-x-0.5 group-hover/caption:-translate-y-0.5"
        />
      ) : null}
    </>
  ) : null;

  const captionClass =
    "absolute right-4 bottom-4 left-4 flex items-center gap-4 border bg-background/90 px-4 py-3 text-foreground backdrop-blur-sm sm:right-auto sm:min-w-64";

  return (
    <section
      data-slot="hero-editorial"
      className={cn("grid items-stretch gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-0", className)}
      {...props}
    >
      <div
        data-slot="hero-editorial-copy"
        className="flex flex-col justify-end gap-6 lg:py-16 lg:pr-14"
      >
        {eyebrow ? (
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">{eyebrow}</p>
        ) : null}
        <Heading className="font-serif text-5xl leading-[0.95] tracking-tight text-balance sm:text-6xl xl:text-7xl">
          {title}
        </Heading>
        {description ? (
          <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div> : null}
      </div>

      <figure
        data-slot="hero-editorial-media"
        className="relative m-0 overflow-hidden bg-secondary"
        style={{ aspectRatio }}
      >
        {renderImage ? (
          renderImage(imgProps)
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a block can't assume next/image
          <img {...imgProps} alt={image.alt} />
        )}
        {caption ? (
          caption.href ? (
            <figcaption>
              <a
                href={caption.href}
                className={cn(
                  captionClass,
                  "group/caption transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                )}
              >
                {captionBody}
              </a>
            </figcaption>
          ) : (
            <figcaption className={captionClass}>{captionBody}</figcaption>
          )
        ) : null}
      </figure>
    </section>
  );
}
