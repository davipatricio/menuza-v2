/**
 * The account danger zone: delete the account behind this session.
 *
 * The confirmation repeats the account's e-mail address, which the server
 * compares against the member that owns the cookie — a stolen session cannot
 * erase an account it cannot name. On success the member row is gone, so the
 * only sensible destination is the login screen.
 *
 * A store the member solely owned is archived, not deleted; the copy says so,
 * because a member who expects their storefront to keep selling would read the
 * archived store as a bug.
 */
import { useState, useTransition } from "react";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { deleteAccount } from "@/lib/session-client.ts";

export function DeleteAccountCard({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmed = typed.trim().toLowerCase() === email.trim().toLowerCase();

  function handleOpenChange(next: boolean) {
    if (pending) return;

    setOpen(next);
    setTyped("");
    setError(null);
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteAccount(email);
        setOpen(false);
        await router.navigate({ to: "/dashboard/login", search: { returnTo: undefined } });
      } catch {
        setError("Não foi possível excluir a conta. Tente novamente.");
      }
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Excluir conta</CardTitle>
        <CardDescription>
          Exclui sua conta e encerra suas sessões em todos os dispositivos. Uma loja da qual você é
          o único responsável é arquivada: ela sai do ar, mas os pedidos já emitidos continuam
          valendo para quem comprou.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Conta não excluída</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger render={<Button variant="destructive" disabled={pending} />}>
            {pending ? "Excluindo…" : "Excluir minha conta"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a conta de {email}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Para confirmar, digite o e-mail da conta. Lojas das
                quais você é o único responsável são arquivadas, e os pedidos já emitidos continuam
                valendo.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Field>
              <FieldLabel htmlFor="delete-account-email">E-mail da conta</FieldLabel>
              <Input
                autoComplete="off"
                id="delete-account-email"
                placeholder={email}
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
              <FieldDescription>Precisa ser igual a {email}.</FieldDescription>
            </Field>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!confirmed || pending}
                variant="destructive"
                onClick={(event) => {
                  // Keep the dialog open: the transition reports its own failure.
                  event.preventDefault();
                  handleDelete();
                }}
              >
                {pending ? "Excluindo…" : "Excluir conta"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
