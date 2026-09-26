import Link from "next/link";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";

export default function DashboardUnauthorized() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <h1 id="dashboard-unauthorized-heading" className="text-base leading-snug font-medium">
            Entre para continuar
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-pretty text-muted-foreground">
            O painel da loja exige uma sessão ativa. Entre com a sua conta ou crie uma nova.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/dashboard/login" aria-label="Entrar no painel" />}>
              Entrar
            </Button>
            <Button
              variant="outline"
              render={<Link href="/dashboard/signup" aria-label="Criar uma conta" />}
            >
              Criar conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
