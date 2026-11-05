import { useState } from "react";
import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { KitForm } from "@/features/catalog/components/kit-form.tsx";
import { getKitFn, listKitOptionsFn } from "@/features/catalog/server/kit-editor.functions.ts";
import { deleteKitFn } from "@/features/catalog/server/kit-mutations.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/kits/$kitId")({
  loader: async ({ params }) => {
    const [payload, options] = await Promise.all([
      getKitFn({ data: { storeSlug: params.storeSlug, kitId: params.kitId } }),
      listKitOptionsFn({ data: { storeSlug: params.storeSlug } }),
    ]);

    if (!payload || !options) throw redirect({ href: "/dashboard/login" });

    if (!payload.kit) throw notFound();

    return { kit: payload.kit, options: options.products };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: pageTitle(loaderData?.kit.name ?? "Kit") }],
  }),
  component: EditKitPage,
});

function EditKitPage() {
  const { kit, options } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();
  const navigate = useNavigate();
  const [created] = useQueryState("created", parseAsString.withDefault(""));
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletion = useMutation({
    mutationFn: () => deleteKitFn({ data: { storeSlug, kitId: kit.id } }),
    onSuccess: (result) => {
      if (result.status !== "ok") {
        setDeleteError(
          result.status === "unauthenticated"
            ? "Sua sessão expirou. Entre novamente."
            : "Não foi possível excluir o kit. Tente novamente.",
        );

        return;
      }

      void navigate({ href: `/dashboard/${storeSlug}/catalog/kits` });
    },
  });

  return (
    <section aria-labelledby="kit-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="kit-heading" className="text-xl font-semibold tracking-tight">
            {kit.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Edite a composição, o preço e as regras do kit.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}>Excluir kit</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {kit.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                O kit sai da loja e não pode mais ser montado. Pedidos já feitos não mudam.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  deletion.mutate();
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {created === "1" ? (
        <Alert>
          <AlertTitle>Kit criado</AlertTitle>
          <AlertDescription>
            Confira a composição e o preço antes de publicar na loja.
          </AlertDescription>
        </Alert>
      ) : null}

      {deleteError ? (
        <Alert variant="destructive" role="status">
          <AlertTitle>Não foi possível excluir</AlertTitle>
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <KitForm storeSlug={storeSlug} options={options} kit={kit} />
    </section>
  );
}
