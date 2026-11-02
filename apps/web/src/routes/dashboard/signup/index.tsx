import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { AccountForm } from "@/features/auth/components/signup/account-form.tsx";
import { SignupFrame } from "@/features/auth/components/signup/signup-frame.tsx";
import { getSessionFn } from "@/features/shell/server/store.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

export const Route = createFileRoute("/dashboard/signup/")({
  // Public: an authenticated visitor is already past this step.
  beforeLoad: async () => {
    const session = await getSessionFn().catch(() => null);

    if (session) throw redirect({ href: "/dashboard" });
  },
  head: () => ({ meta: [{ title: pageTitle("Criar conta") }] }),
  component: SignupAccountPage,
});

/** Signup step 1 — account. */
function SignupAccountPage() {
  return (
    <SignupFrame
      currentStep={0}
      steps={STEPS}
      title="Criar sua conta"
      description="Comece com seus dados. Depois você entra numa loja com convite ou cria a sua."
    >
      <Card>
        <CardContent>
          <AccountForm />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          to="/dashboard/login"
          search={{ returnTo: undefined }}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </SignupFrame>
  );
}
