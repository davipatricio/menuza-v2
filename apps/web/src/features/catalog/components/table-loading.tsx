import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Route-level pending UI for every catalog list. The old app had one
 * `loading.tsx` per screen; a single shape is enough because the tables share
 * the same toolbar + header layout.
 */
export function TableLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-56 flex-1" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0"
          >
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
