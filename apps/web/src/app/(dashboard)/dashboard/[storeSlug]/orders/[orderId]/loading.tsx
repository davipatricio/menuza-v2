import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function OrderDetailLoading() {
  return (
    <section aria-label="Carregando pedido" aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-4 w-48" />
      <p className="text-sm text-pretty text-muted-foreground">Carregando pedido…</p>
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </section>
  );
}
