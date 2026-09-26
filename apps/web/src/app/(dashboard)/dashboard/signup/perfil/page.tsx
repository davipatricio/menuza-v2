import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { SignupFrame } from "../_components/signup-frame.tsx";
import { OnboardingForm } from "./onboarding-form.tsx";

// Guarded by a request-time session read.
export const instant = false;

export const metadata: Metadata = {
  title: "Sobre você — Menuza",
};

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

/**
 * Signup profiling step (MEN-225), between the account and the destination
 * fork. The answers are optional for existing members; a brand-new account is
 * routed here by the account form, and `escolha` sends it back if it skipped
 * this step. The saved persona highlights the suggested fork card.
 */
export default async function SignupProfilePage() {
  const session = await getPanelSession();

  if (!session) redirect("/dashboard/login");

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
