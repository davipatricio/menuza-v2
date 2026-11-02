/**
 * Router-wide pending state, wired as `defaultPendingComponent` in
 * `src/router.tsx`. Rendered while a route loader runs.
 */
export function Pending() {
  return (
    <div className="grid min-h-svh place-content-center p-8" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground motion-reduce:animate-none"
      />
    </div>
  );
}
