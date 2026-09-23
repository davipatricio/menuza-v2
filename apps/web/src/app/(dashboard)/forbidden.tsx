import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";

export default function DashboardForbidden() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <h1 id="dashboard-forbidden-heading" className="text-base leading-snug font-medium">
            Sem permissão
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-pretty text-muted-foreground">
            Sua conta não tem acesso a esta loja. Fale com o responsável para solicitar acesso.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
