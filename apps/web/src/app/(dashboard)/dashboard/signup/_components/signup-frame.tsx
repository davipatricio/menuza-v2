"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Store } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";

export interface SignupFrameProps {
  /** Zero-based index of the step being rendered. */
  currentStep: number;
  steps: ReadonlyArray<string>;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Shared chrome for the signup wizard: the same neutral, sidebar-free screen
 * as the login page plus an animated progress rail. Each step animates in, so
 * moving between `/dashboard/signup/*` routes reads as a micro-transition.
 */
export function SignupFrame({
  currentStep,
  steps,
  title,
  description,
  children,
}: SignupFrameProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-lg text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Store className="size-3.5" />
          </span>
          Menuza
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-md flex-col gap-8">
          <ol className="flex items-center gap-2" aria-label="Etapas do cadastro">
            {steps.map((label, index) => {
              const done = index < currentStep;
              const current = index === currentStep;

              return (
                <li
                  key={label}
                  className="flex min-w-0 flex-1 items-center gap-2"
                  aria-current={current ? "step" : undefined}
                >
                  <motion.span
                    aria-hidden="true"
                    animate={reduceMotion ? undefined : { scale: current ? 1.08 : 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                      done && "border-primary bg-primary text-primary-foreground",
                      current && "border-ring bg-background text-foreground",
                      !done && !current && "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </motion.span>
                  <span
                    className={cn(
                      "hidden truncate text-xs font-medium sm:inline",
                      current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-px flex-1 transition-colors duration-300 motion-reduce:transition-none",
                        done ? "bg-primary/60" : "bg-border",
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
