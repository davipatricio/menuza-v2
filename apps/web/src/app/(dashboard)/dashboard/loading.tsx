import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function DashboardPickerLoading() {
  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-24" />
      </header>
      <main
        aria-label="Carregando lojas"
        aria-busy="true"
        className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:px-6 md:py-16"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
