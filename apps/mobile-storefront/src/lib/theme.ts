import type { PublicTheme } from "@menuza/api-client/model";
import { Uniwind } from "uniwind";

/**
 * Paints the store's palette.
 *
 * The API already resolved every value: saved color or platform default, plus
 * the ink contrast picked. This only maps them onto the same token names
 * `global.css` declares, so a theme change is a variable update, not a second
 * stylesheet.
 */
export function applyStoreTheme(theme: PublicTheme): void {
  const radius = Math.max(0, Math.round(theme.radius));

  Uniwind.updateCSSVariables("light", {
    "--color-background": theme.backgroundColor,
    "--color-foreground": theme.foregroundColor,
    "--color-primary": theme.primaryColor,
    "--color-primary-foreground": theme.primaryForeground,
    "--color-accent": theme.accentColor,
    "--radius-sm": `${Math.max(0, Math.round(radius * 0.6))}px`,
    "--radius-md": `${Math.max(0, Math.round(radius * 0.8))}px`,
    "--radius-lg": `${radius}px`,
    "--radius-xl": `${Math.round(radius * 1.4)}px`,
  });
}
