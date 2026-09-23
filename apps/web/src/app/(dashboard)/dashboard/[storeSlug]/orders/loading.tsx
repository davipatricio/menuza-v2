import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function OrdersLoading() {
  return (
    <section aria-label="Carregando pedidos" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-sm" />
      <p className="text-sm text-pretty text-muted-foreground">Carregando pedidos…</p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </section>
  );
}
