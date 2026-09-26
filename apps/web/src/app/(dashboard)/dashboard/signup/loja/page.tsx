import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { getPanelSession } from "@/lib/server-tenant.ts";
import { SignupFrame } from "../_components/signup-frame.tsx";
import { StoreForm } from "./store-form.tsx";

// Guarded by a request-time session read.
export const instant = false;

export const metadata: Metadata = {
  title: "Criar loja — Menuza",
};

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

/** Signup step 3 (create branch). Requires the account's session. */
export default async function SignupStorePage() {
  const session = await getPanelSession();

  if (!session) redirect("/dashboard/login");

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
          href="/dashboard/signup/escolha"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Voltar
        </Link>
      </p>
    </SignupFrame>
  );
}
