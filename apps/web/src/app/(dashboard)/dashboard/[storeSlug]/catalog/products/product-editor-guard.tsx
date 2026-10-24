"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "cn";

type Section = "product" | "nutrition" | "seo";

type DirtySections = Record<Section, boolean>;

type GuardActions = {
  setSectionDirty: (section: Section, dirty: boolean) => void;
  requestLeave: (href: string) => void;
};

const GuardActionsContext = createContext<GuardActions | null>(null);

const DirtySectionsContext = createContext<DirtySections>({
  product: false,
  nutrition: false,
  seo: false,
});

/** Registers a mounted form's dirty flag with the page-level guard. */
export function useDirtySection(section: Section, dirty: boolean) {
  const actions = useContext(GuardActionsContext);

  useEffect(() => {
    if (!actions) return;

    actions.setSectionDirty(section, dirty);

    return () => actions.setSectionDirty(section, false);
  }, [actions, section, dirty]);
}

/** The Cancelar-style exits use this instead of pushing directly. */
export function useLeaveGuard() {
  return useContext(GuardActionsContext);
}

/**
 * "Produto, Tabela nutricional e SEO": a list of three sections reads with a
 * comma and a final "e", never as "A e B e C".
 */
function formatSectionList(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";

  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1) ?? ""}`;
}

export function PendingChangesStatus({ className }: { className?: string }) {
  const sections = useContext(DirtySectionsContext);
  const dirty = sections.product || sections.nutrition || sections.seo;

  const labels = [
    sections.product ? "Produto" : null,
    sections.nutrition ? "Tabela nutricional" : null,
    sections.seo ? "SEO" : null,
  ].filter((label): label is string => label !== null);

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex min-h-6 flex-wrap items-center gap-2 text-sm", className)}
    >
      {dirty ? (
        <>
          <Badge variant="secondary">Alterações não salvas</Badge>
          <span className="text-muted-foreground">{formatSectionList(labels)}</span>
        </>
      ) : (
        <>
          <CircleCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">Tudo salvo</span>
        </>
      )}
    </p>
  );
}

/**
 * Owns the page's unsaved-changes guard. `beforeunload` covers a hard unload;
 * a capture-phase click listener covers same-origin anchors (sidebar,
 * breadcrumb, any future Link) without wrapping every link. Programmatic exits
 * opt in through `requestLeave`.
 */
export function ProductEditorGuard({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [sections, setSections] = useState<DirtySections>({
    product: false,
    nutrition: false,
    seo: false,
  });

  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sectionsRef = useRef(sections);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const setSectionDirty = useCallback((section: Section, dirty: boolean) => {
    setSections((current) =>
      current[section] === dirty ? current : { ...current, [section]: dirty },
    );
  }, []);

  const requestLeave = useCallback(
    (href: string) => {
      if (Object.values(sectionsRef.current).some(Boolean)) {
        setPendingHref(href);

        return;
      }

      router.push(href);
    },
    [router],
  );

  const actions = useMemo(
    () => ({ setSectionDirty, requestLeave }),
    [setSectionDirty, requestLeave],
  );

  const anyDirty = Object.values(sections).some(Boolean);

  useEffect(() => {
    if (!anyDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  useEffect(() => {
    if (!anyDirty) return;

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");

      if (!anchor) return;

      if (anchor.target && anchor.target !== "_self") return;

      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);

      if (url.origin !== window.location.origin) return;

      // Same page (hash or query-only links) is not leaving the editor.
      if (url.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };

    document.addEventListener("click", onClick, true);

    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty]);

  const leave = () => {
    const href = pendingHref;
    setPendingHref(null);

    if (href) router.push(href);
  };

  return (
    <GuardActionsContext.Provider value={actions}>
      <DirtySectionsContext.Provider value={sections}>{children}</DirtySectionsContext.Provider>

      <AlertDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ficar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={leave}>
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardActionsContext.Provider>
  );
}
