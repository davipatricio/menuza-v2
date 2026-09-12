"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button.tsx";

/**
 * Cycles through: system → light → dark → system.
 * Renders nothing until mounted to avoid hydration mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label = theme === "system" ? "Sistema" : theme === "light" ? "Claro" : "Escuro";

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme(next)}
      aria-label={`Tema atual: ${label}. Clique para alternar.`}
    >
      Tema: {label}
    </Button>
  );
}
