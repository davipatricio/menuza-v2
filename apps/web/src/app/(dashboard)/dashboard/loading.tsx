import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function DashboardPickerLoading() {
  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-40" />
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <p role="status" className="sr-only">
          Carregando lojas…
        </p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
