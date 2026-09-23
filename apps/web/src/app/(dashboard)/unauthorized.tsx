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
            O painel da loja exige uma sessão ativa. O acesso ainda não está disponível neste
            mockup.
          </p>
          <div>
            <Button render={<Link href="/" aria-label="Voltar para o início" />}>
              Voltar para o início
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
