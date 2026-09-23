import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function CatalogLoading() {
  return (
    <section aria-label="Carregando catálogo" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <p className="text-sm text-pretty text-muted-foreground">Carregando catálogo…</p>
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </section>
  );
}
