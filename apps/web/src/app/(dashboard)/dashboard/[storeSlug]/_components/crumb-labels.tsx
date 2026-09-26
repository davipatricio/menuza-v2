"use client";

import { createContext, useContext } from "react";

/**
 * Names for path segments that are ids, so the breadcrumb can read
 * `Maria Silva` instead of a UUID.
 *
 * The shell renders the header above `children`, so a detail page cannot hand
 * its own name up as a prop. It publishes it here instead (see
 * `customer-crumb.tsx`), and the breadcrumb reads it back. No data fetching
 * lives in the browser: the name comes from the row the page already loaded.
 */
export const CrumbLabelsContext = createContext<Record<string, string>>({});

export function useCrumbLabels(): Record<string, string> {
  return useContext(CrumbLabelsContext);
}
