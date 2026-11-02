import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { InviteForm } from "@/features/auth/components/signup/invite-form.tsx";
import { SignupFrame } from "@/features/auth/components/signup/signup-frame.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

export const Route = createFileRoute("/dashboard/signup/_onboarding/convite")({
  head: () => ({ meta: [{ title: pageTitle("Entrar com convite") }] }),
  component: SignupInvitePage,
});

/** Signup step 3 (invite branch) — a navigable stub until invites exist. */
function SignupInvitePage() {
  return (
    <SignupFrame
      currentStep={3}
      steps={STEPS}
      title="Entrar com um convite"
      description="Use o código que você recebeu para entrar numa loja que já existe."
    >
      <Card>
        <CardContent>
          <InviteForm />
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
