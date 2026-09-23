"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import { cn } from "cn";

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Laptop },
] as const;

/**
 * Segmented theme control: Claro / Escuro / Sistema.
 * `compact` renders a single light/dark toggle for collapsed shell states.
 * Renders a stable placeholder until mounted to avoid hydration mismatch.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (compact) {
    const dark = mounted && resolvedTheme === "dark";

    return (
      <button
        type="button"
        aria-label="Alternar tema"
        title="Alternar tema"
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {dark ? (
          <Sun aria-hidden="true" className="size-4" />
        ) : (
          <Moon aria-hidden="true" className="size-4" />
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Tema"
      className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {THEMES.map((option) => {
        const Icon = option.icon;
        const active = mounted && theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            title={option.label}
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
