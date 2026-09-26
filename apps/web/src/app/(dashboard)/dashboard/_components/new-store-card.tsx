import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Card "Nova loja" — último item da grade do picker. Leva ao passo de criação
 * do fluxo de cadastro (`panel.createStore`, o mesmo usado no signup).
 */
export function NewStoreCard() {
  return (
    <Link
      href="/dashboard/signup/loja"
      aria-label="Criar uma nova loja"
      className="group/new-store flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-[transform,border-color,background-color,box-shadow] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:border-ring/50 hover:bg-card hover:shadow-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-[transform,background-color,border-color,color] duration-300 ease-out group-hover/new-store:scale-105 group-hover/new-store:rotate-90 group-hover/new-store:border-transparent group-hover/new-store:bg-primary group-hover/new-store:text-primary-foreground motion-reduce:transition-none motion-reduce:group-hover/new-store:scale-100 motion-reduce:group-hover/new-store:rotate-0"
      >
        <Plus className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-base font-medium">Nova loja</span>
        <span className="text-sm text-muted-foreground">Criar uma loja no Menuza</span>
      </span>
    </Link>
  );
}
