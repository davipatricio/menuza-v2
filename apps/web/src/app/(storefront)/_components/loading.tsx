import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Storefront route skeleton. Every route below the group root ships one. */
export function StorefrontLoading({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="text-sm text-muted-foreground">
        {label}…
      </p>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </section>
  );
}
