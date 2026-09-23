"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";

/**
 * Card "Nova loja" — último item da grade do picker. O gatilho é um button
 * real e focável; a criação em si ainda não existe no mockup, então o clique
 * explica isso em vez de ficar desabilitado (o que mataria hover e foco).
 */
export function NewStoreCard() {
  return (
    <Dialog>
      <DialogTrigger className="group/new-store flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-[transform,border-color,background-color,box-shadow] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:border-ring/50 hover:bg-card hover:shadow-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0">
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
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova loja</DialogTitle>
          <DialogDescription>
            A criação de lojas ainda não está disponível neste mockup. Quando existir, ela começa
            aqui.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Entendi</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
