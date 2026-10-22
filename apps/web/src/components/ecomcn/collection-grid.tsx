import * as React from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "cn";

/*
 * Three collections as a magazine spread: one dominant tile, two
 * supporting.
 *
 *   <CollectionGrid tiles={[lead, second, third]} title="The edit" />
 *
 * A 12-column grid split 7 / 5: the lead tile spans both rows on the left,
 * the other two stack on the right, and the type scale follows the tile —
 * the big one gets the big heading. On a phone it never collapses into
 * three identical cards: the lead stays full width and tall, and the two
 * supporting tiles pair up beneath it, smaller, with smaller type. Tiles
 * are ruled 1px apart over your border colour. No state, no "use client":
 * it renders on the server.
 */

export interface CollectionTile {
  id: string;
  title: string;
  href: string;
  /** "Autumn edit", "New in". */
  eyebrow?: string;
  /** Shown on the lead tile only — the others are too small for it. */
  description?: string;
  /** "Shop the edit", by default. */
  cta?: string;
  /** Already rendered, so the block never assumes next/image. It fills the tile. */
  image: React.ReactNode;
}

export interface CollectionGridProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** The first is the lead; the next two support it. More are ignored. */
  tiles: CollectionTile[];
  title?: React.ReactNode;
}

export function CollectionGrid({ tiles, title, className, ...props }: CollectionGridProps) {
  const [lead, ...rest] = tiles.slice(0, 3);
  const headingId = React.useId();

  if (!lead) return null;

  return (
    <section
      data-slot="collection-grid"
      aria-labelledby={title ? headingId : undefined}
      className={cn("flex flex-col gap-5", className)}
      {...props}
    >
      {title ? (
        <h2 id={headingId} className="border-b pb-4 text-2xl">
          {title}
        </h2>
      ) : null}
      <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-12 lg:grid-rows-2">
        <Tile
          tile={lead}
          size="lead"
          className="col-span-2 aspect-[4/5] sm:aspect-[16/11] lg:col-span-7 lg:row-span-2 lg:aspect-auto"
        />
        {rest.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            size="support"
            className="col-span-1 aspect-square lg:col-span-5 lg:aspect-[16/10]"
          />
        ))}
      </div>
    </section>
  );
}

function Tile({
  tile,
  size,
  className,
}: {
  tile: CollectionTile;
  size: "lead" | "support";
  className?: string;
}) {
  const lead = size === "lead";

  return (
    <a
      href={tile.href}
      data-slot="collection-grid-tile"
      data-size={size}
      className={cn(
        "group relative isolate flex flex-col justify-end overflow-hidden bg-secondary text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      <span className="absolute inset-0 -z-10 transition-transform duration-700 ease-out group-hover:scale-[1.03] [&>img]:size-full [&>img]:object-cover">
        {tile.image}
      </span>
      {/* A scrim under the words, so they read on any photo. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-black/65 via-black/25 to-transparent"
      />
      <span
        className={cn("flex flex-col", lead ? "gap-3 p-6 sm:p-8 lg:p-10" : "gap-1.5 p-4 sm:p-6")}
      >
        {tile.eyebrow ? (
          <span
            className={cn(
              "tracking-[0.16em] text-white/80 uppercase",
              lead ? "text-xs" : "text-[10.5px]",
            )}
          >
            {tile.eyebrow}
          </span>
        ) : null}
        <span
          className={cn(
            "font-serif leading-[1.02] tracking-tight text-balance",
            lead ? "text-4xl sm:text-5xl lg:text-6xl" : "text-xl sm:text-2xl lg:text-3xl",
          )}
        >
          {tile.title}
        </span>
        {lead && tile.description ? (
          <span className="max-w-sm text-sm leading-relaxed text-white/85">{tile.description}</span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-2 underline-offset-4 group-hover:underline",
            lead ? "mt-2 text-sm" : "text-[12.5px] max-sm:sr-only",
          )}
        >
          {tile.cta ?? "Shop the edit"}
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </span>
    </a>
  );
}
