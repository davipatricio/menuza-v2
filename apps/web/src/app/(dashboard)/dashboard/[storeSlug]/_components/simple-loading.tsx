import { Skeleton } from "@/components/ui/skeleton.tsx";

export function SimpleLoading({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <p role="status" className="text-sm text-pretty text-muted-foreground">
        {label}…
      </p>
      <Skeleton className="h-40 w-full" />
    </section>
  );
}
