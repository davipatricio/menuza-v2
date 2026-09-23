import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function CustomerDetailLoading() {
  return (
    <section aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <p role="status" className="text-sm text-pretty text-muted-foreground">
        Carregando cliente…
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
    </section>
  );
}
