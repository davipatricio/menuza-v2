import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { SignupFrame } from "@/features/auth/components/signup/signup-frame.tsx";
import { StoreForm } from "@/features/auth/components/signup/store-form.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

export const Route = createFileRoute("/dashboard/signup/_onboarding/loja")({
  head: () => ({ meta: [{ title: pageTitle("Criar loja") }] }),
  component: SignupStorePage,
});

/** Signup step 3 (create branch). Requires the account's session. */
function SignupStorePage() {
  return (
    <SignupFrame
      currentStep={3}
      steps={STEPS}
      title="Criar sua loja"
      description="Escolha o nome e o endereço. Você entra como proprietário."
    >
      <Card>
        <CardContent>
          <StoreForm />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          to="/dashboard/signup/escolha"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Voltar
        </Link>
      </p>
    </SignupFrame>
  );
}
