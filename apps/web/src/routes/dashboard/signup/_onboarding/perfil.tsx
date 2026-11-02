import { createFileRoute } from "@tanstack/react-router";
import { OnboardingForm } from "@/features/auth/components/signup/onboarding-form.tsx";
import { SignupFrame } from "@/features/auth/components/signup/signup-frame.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

export const Route = createFileRoute("/dashboard/signup/_onboarding/perfil")({
  head: () => ({ meta: [{ title: pageTitle("Sobre você") }] }),
  component: SignupProfilePage,
});

/**
 * Signup profiling step (MEN-225), between the account and the destination
 * fork. The answers are optional for existing members.
 */
function SignupProfilePage() {
  const { session } = Route.useRouteContext();

  return (
    <SignupFrame
      currentStep={1}
      steps={STEPS}
      title="Sobre você"
      description="Usamos suas respostas para melhorar o Menuza para o seu caso."
    >
      <OnboardingForm initial={session.onboarding ?? null} />
    </SignupFrame>
  );
}
