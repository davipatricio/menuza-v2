"use client";

import * as React from "react";
import { Pause, Play, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

/*
 * The thin bar above everything: free-shipping thresholds, sale windows,
 * drops.
 *
 *   <AnnouncementBar items={[{ id: "ship", content: "Free delivery over $300" }]} />
 *   <AnnouncementBar items={items} variant="marquee" />
 *
 * An inverted ink bar, square, with a brand dot between messages. Static
 * shows the messages side by side (the first alone on a phone); the marquee
 * runs them past at 26s a loop — slow enough to read — and stops while the
 * pointer or focus is on it, and for good with its pause button (anything
 * that moves for more than five seconds needs one). Under reduced motion
 * the marquee doesn't run at all; it shows as the static bar.
 *
 * Dismissing folds it away (Motion) and is remembered per `version`, so it
 * stays gone across routes and visits and comes back only when the
 * announcement changes. The server can't read localStorage: a dismissed bar
 * renders and folds away on load unless you pass `dismissed` from a cookie.
 */

export interface Announcement {
  id: string;
  content: React.ReactNode;
  /** Makes the message a link. */
  href?: string;
}

/** The same settle curve as the other ecomcn morphs: no bounce, an editorial ease. */
const MORPH = { duration: 0.45, ease: [0.2, 0, 0, 1] } as const;

export interface AnnouncementBarProps extends React.HTMLAttributes<HTMLElement> {
  items: Announcement[];
  variant?: "static" | "marquee";
  /** Seconds for one loop of the marquee. Defaults to 26. */
  speed?: number;
  /** Shows the close button. Defaults to true. */
  dismissible?: boolean;
  /** Where the dismissal is remembered. Defaults to "ecomcn-announcement". */
  storageKey?: string;
  /** Change it and a dismissed bar comes back. Defaults to the items' ids. */
  version?: string;
  /** Dismissed already — from a cookie you read on the server — so it never renders. */
  dismissed?: boolean;
  onDismiss?: () => void;
  /** The landmark's name. Defaults to "Announcements". */
  label?: string;
}

const listeners = new Set<() => void>();

const subscribeStorage = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

function readDismissed(key: string, version: string) {
  try {
    return localStorage.getItem(key) === version;
  } catch {
    return false; // storage blocked: it just won't be remembered
  }
}

export function AnnouncementBar({
  items,
  variant = "static",
  speed = 26,
  dismissible = true,
  storageKey = "ecomcn-announcement",
  version: versionProp,
  dismissed: dismissedProp,
  onDismiss,
  label = "Announcements",
  className,
  ...props
}: AnnouncementBarProps) {
  const reduce = useReducedMotion();
  const version = versionProp ?? items.map((item) => item.id).join("|");

  const stored = React.useSyncExternalStore(
    subscribeStorage,
    () => readDismissed(storageKey, version),
    () => false,
  );

  const hidden = dismissedProp ?? stored;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, version);
    } catch {
      /* private mode — dismissed for this page only */
    }

    listeners.forEach((notify) => notify());
    onDismiss?.();
  };

  if (items.length === 0) return null;
  const marquee = variant === "marquee" && !reduce;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false}>
        {hidden ? null : (
          <motion.aside
            key="bar"
            aria-label={label}
            data-slot="announcement-bar"
            data-variant={marquee ? "marquee" : "static"}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.15 } : MORPH}
            className={cn("overflow-hidden bg-foreground text-background", className)}
            {...(props as React.ComponentProps<typeof motion.aside>)}
          >
            <div className="relative flex h-10 items-center text-[12.5px] tracking-wide">
              {marquee ? (
                <Marquee items={items} speed={speed} besideClose={dismissible} />
              ) : (
                <StaticMessages items={items} />
              )}
              {dismissible ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={dismiss}
                  aria-label="Dismiss the announcement"
                  className="absolute right-1 z-10 size-8 rounded-none text-background/70 hover:bg-background/10 hover:text-background focus-visible:ring-background/60"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/** The separator: a dot in your brand colour, ink-light when you have none. */
function Dot() {
  return (
    <span
      aria-hidden
      className="mx-4 size-1 shrink-0 rounded-full bg-[var(--brand,currentColor)] opacity-90"
    />
  );
}

function Message({ item }: { item: Announcement }) {
  return item.href ? (
    <a
      href={item.href}
      className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {item.content}
    </a>
  ) : (
    <span>{item.content}</span>
  );
}

/** Side by side, centred; on a phone, the first message alone. */
function StaticMessages({ items }: { items: Announcement[] }) {
  return (
    <ul className="flex w-full items-center justify-center px-12">
      {items.map((item, i) => (
        <li key={item.id} className={cn("flex min-w-0 items-center", i > 0 && "max-sm:hidden")}>
          {i > 0 ? <Dot /> : null}
          <span className="truncate">
            <Message item={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two copies of the messages, end to end, moved left by one copy's width
 * and repeated — seamless. The second copy is hidden from screen readers.
 */
function Marquee({
  items,
  speed,
  besideClose,
}: {
  items: Announcement[];
  speed: number;
  besideClose: boolean;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const [paused, setPaused] = React.useState(false);
  const holds = React.useRef(0);

  React.useEffect(() => {
    controls.current = animate(
      scope.current,
      { x: ["0%", "-50%"] },
      { duration: speed, ease: "linear", repeat: Infinity },
    );

    return () => controls.current?.stop();
  }, [animate, scope, speed]);

  React.useEffect(() => {
    if (paused) controls.current?.pause();
    else if (holds.current === 0) controls.current?.play();
  }, [paused]);

  // Hover and focus hold it still while they last; the button holds it for good.
  const hold = () => {
    holds.current += 1;
    controls.current?.pause();
  };

  const release = () => {
    holds.current = Math.max(0, holds.current - 1);

    if (holds.current === 0 && !paused) controls.current?.play();
  };

  const copy = (hiddenCopy: boolean) => (
    <ul aria-hidden={hiddenCopy || undefined} className="flex shrink-0 items-center pr-0">
      {items.map((item) => (
        <li key={item.id} className="flex items-center whitespace-nowrap">
          {hiddenCopy ? <span>{item.content}</span> : <Message item={item} />}
          <Dot />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div
        // Ends before the buttons — padding wouldn't clip the text running under them.
        className={cn(
          "min-w-0 flex-1 overflow-hidden pl-3 [mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-3rem),transparent)]",
          besideClose ? "mr-20" : "mr-11",
        )}
        onPointerEnter={hold}
        onPointerLeave={release}
        onFocus={hold}
        onBlur={release}
      >
        <div ref={scope} className="flex w-max">
          {copy(false)}
          {copy(true)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play the announcements" : "Pause the announcements"}
        className={cn(
          "absolute z-10 size-8 rounded-none text-background/70 hover:bg-background/10 hover:text-background focus-visible:ring-background/60",
          besideClose ? "right-10" : "right-1",
        )}
      >
        {paused ? (
          <Play className="size-3.5" aria-hidden />
        ) : (
          <Pause className="size-3.5" aria-hidden />
        )}
      </Button>
    </>
  );
}
