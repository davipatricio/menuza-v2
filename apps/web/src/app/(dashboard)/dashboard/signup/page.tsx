import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { SignupFrame } from "./_components/signup-frame.tsx";
import { AccountForm } from "./account-form.tsx";

// Reads the session to redirect an already-authenticated visitor.
export const instant = false;

export const metadata: Metadata = {
  title: "Criar conta — Menuza",
};

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

/**
 * Signup step 1 — account. Public: an authenticated visitor is already past
 * this, so they go straight to the picker.
 */
export default async function SignupAccountPage() {
  const session = await getPanelSession();

  if (session) redirect("/dashboard");

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
          href="/dashboard/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </SignupFrame>
  );
}
