"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type CrumbLabelsValue = {
  labels: Record<string, string>;
  publish: (id: string, label: string) => void;
  clear: (id: string) => void;
};

const CrumbLabelsContext = createContext<CrumbLabelsValue | null>(null);

/**
 * Names for path segments that are ids, so the breadcrumb can read
 * `Maria Silva` instead of a UUID.
 *
 * The provider lives in the shell layout, above both the header and the page.
 * A detail page cannot provide a value straight to the header: the header is
 * its sibling, not its child. It publishes the label upward instead, and the
 * breadcrumb reads it back. The name comes from the row the page already
 * loaded, so no data fetching lives in the browser.
 */
export function CrumbLabelsProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  const publish = useCallback((id: string, label: string) => {
    setLabels((previous) => (previous[id] === label ? previous : { ...previous, [id]: label }));
  }, []);

  const clear = useCallback((id: string) => {
    setLabels((previous) => {
      if (!(id in previous)) return previous;

      const next = { ...previous };
      delete next[id];

      return next;
    });
  }, []);

  const value = useMemo(() => ({ labels, publish, clear }), [labels, publish, clear]);

  return <CrumbLabelsContext.Provider value={value}>{children}</CrumbLabelsContext.Provider>;
}

function useCrumbLabelContext(): CrumbLabelsValue {
  const context = useContext(CrumbLabelsContext);

  if (!context) throw new Error("CrumbLabelsProvider is missing from the dashboard shell.");

  return context;
}

export function useCrumbLabels(): Record<string, string> {
  return useCrumbLabelContext().labels;
}

/** Publishes one id → label pair while the caller is mounted. */
export function usePublishCrumbLabel(id: string, label: string): void {
  const { publish, clear } = useCrumbLabelContext();

  useEffect(() => {
    publish(id, label);

    return () => clear(id);
  }, [id, label, publish, clear]);
}
