"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * Partial Prefetching: keep the default "auto" App Shell prefetch before intent,
 * then resolve the private URL-specific editor reads once the user shows intent
 * (hover/focus) instead of one server render per visible row.
 * https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch
 */
export function HoverPrefetchLink(props: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);

  return (
    <Link
      {...props}
      prefetch={active ? true : "auto"}
      onMouseEnter={(event) => {
        setActive(true);
        props.onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setActive(true);
        props.onFocus?.(event);
      }}
    >
      {props.children}
    </Link>
  );
}
