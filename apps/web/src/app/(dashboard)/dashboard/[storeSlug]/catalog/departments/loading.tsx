import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="overflow-hidden rounded-xl border border-border shadow-surface">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
