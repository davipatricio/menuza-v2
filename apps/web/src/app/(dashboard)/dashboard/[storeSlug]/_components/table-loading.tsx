import { Skeleton } from "@/components/ui/skeleton.tsx";

export function TableLoading({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <p role="status" className="text-sm text-pretty text-muted-foreground">
        {label}…
      </p>
      <Skeleton className="h-9 w-full max-w-sm" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </section>
  );
}
