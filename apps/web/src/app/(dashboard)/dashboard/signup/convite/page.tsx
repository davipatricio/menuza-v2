import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { SignupFrame } from "../_components/signup-frame.tsx";
import { InviteForm } from "./invite-form.tsx";

// Guarded by a request-time session read.
export const instant = false;

export const metadata: Metadata = {
  title: "Entrar com convite — Menuza",
};

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

/** Signup step 3 (invite branch) — a navigable stub until invites exist. */
export default async function SignupInvitePage() {
  const session = await getPanelSession();

  if (!session) redirect("/dashboard/login");

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
          href="/dashboard/signup/escolha"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Voltar
        </Link>
      </p>
    </SignupFrame>
  );
}
