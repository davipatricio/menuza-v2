"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { tenantClient } from "./global-search-actions.ts";
import { searchNavPages } from "./nav-config.ts";
import {
  mergeGroups,
  type PageSearchItem,
  type PanelSearchGroup,
  type SearchGroup,
} from "./global-search-utils.ts";

const MIN_QUERY = 2;

const DEBOUNCE_MS = 250;

const SEARCH_ERROR = "Não foi possível buscar agora. Tente novamente.";

/** One fetched result, tagged with the query it answers. */
interface SearchResult {
  q: string;
  groups: PanelSearchGroup[];
  canWrite: boolean;
}

/** One failed query, tagged so a new keystroke does not inherit the message. */
interface SearchFailure {
  q: string;
  message: string;
}

export interface GlobalSearchState {
  query: string;
  setQuery: (query: string) => void;
  groups: SearchGroup[];
  canWrite: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Nav pages carry no `kind`/`id`, so the palette maps them into the shared page item. */
function toPageItems(pages: ReturnType<typeof searchNavPages>): PageSearchItem[] {
  return pages.map((page) => ({
    kind: "page",
    id: page.href,
    label: page.label,
    href: page.href,
    section: page.section,
  }));
}

export function useGlobalSearch({ storeSlug }: { storeSlug: string }): GlobalSearchState {
  const basePath = `/dashboard/${storeSlug}`;

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Bumped on every effect run and on cleanup, so a stale response is dropped. */
  const requestId = useRef(0);

  const trimmed = query.trim();
  const short = trimmed.length < MIN_QUERY;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;

    const request = (requestId.current += 1);

    const timer = setTimeout(() => {
      setPending(trimmed);

      const client = tenantClient();

      client.panel
        .search({ storeSlug, q: trimmed })
        .then((output) => {
          if (requestId.current !== request) return;

          setResult({ q: trimmed, groups: output.groups, canWrite: output.canWrite });
          setFailure(null);
        })
        .catch(() => {
          if (requestId.current !== request) return;

          setFailure({ q: trimmed, message: SEARCH_ERROR });
        })
        .finally(() => {
          if (requestId.current !== request) return;

          setPending(null);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [trimmed, storeSlug, attempt]);

  const groups = useMemo(() => {
    const pages = toPageItems(searchNavPages(short ? "" : trimmed, basePath));

    return mergeGroups(short || !result ? [] : result.groups, pages);
  }, [basePath, result, short, trimmed]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return {
    query,
    setQuery,
    groups,
    canWrite: short ? false : (result?.canWrite ?? false),
    loading: !short && pending === trimmed,
    error: short ? null : failure?.q === trimmed ? failure.message : null,
    retry,
  };
}
