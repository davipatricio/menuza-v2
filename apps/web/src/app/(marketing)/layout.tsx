import type { ReactNode } from "react";

// The marketing pages are fully static (no request-specific data). Require the
// complete server-rendered route to stay static so a later change cannot
// silently turn one of them into per-request rendering (Next 16.4 ensureStatic).
export const ensureStatic = "navigation";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
