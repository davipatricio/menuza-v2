import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Store, Ticket } from "lucide-react";
import { cn } from "cn";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SignupFrame } from "@/features/auth/components/signup/signup-frame.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const STEPS = ["Conta", "Perfil", "Destino", "Loja"] as const;

interface ChoiceProps {
  to: "/dashboard/signup/convite" | "/dashboard/signup/loja";
  icon: typeof Store;
  title: string;
  description: string;
  suggested?: boolean;
}

export const Route = createFileRoute("/dashboard/signup/_onboarding/escolha")({
  beforeLoad: ({ context }) => {
    // A brand-new account reaches this step through `/perfil`; if it skipped
    // the profiling step, send it back.
    if (context.session.memberships.length === 0 && !context.session.onboarding) {
      throw redirect({ to: "/dashboard/signup/perfil" });
    }
  },
  head: () => ({ meta: [{ title: pageTitle("Escolha um destino") }] }),
  component: SignupChoicePage,
});

function Choice({ to, icon: Icon, title, description, suggested = false }: ChoiceProps) {
  return (
    <Link
      to={to}
      aria-label={title}
      className="group/choice block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        className={cn(
          "transition-[transform,box-shadow] duration-200 ease-out group-hover/choice:-translate-y-0.5 group-hover/choice:shadow-surface-hover motion-reduce:transition-none motion-reduce:group-hover/choice:translate-y-0",
          suggested && "border-primary/40",
        )}
      >
        <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-hover/choice:bg-primary group-hover/choice:text-primary-foreground motion-reduce:transition-none"
          >
            <Icon className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">{title}</CardTitle>
              {suggested ? (
                <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  Sugerido
                </span>
              ) : null}
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
          <ArrowRight
            aria-hidden="true"
            className="size-4 text-muted-foreground transition-transform duration-200 ease-out group-hover/choice:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/choice:translate-x-0"
          />
        </CardHeader>
      </Card>
    </Link>
  );
}

/**
 * Signup step 3 — the fork. The saved persona highlights one card; it never
 * blocks the other.
 */
function SignupChoicePage() {
  const { session } = Route.useRouteContext();
  const persona = session.onboarding?.persona ?? null;

  return (
    <SignupFrame
      currentStep={2}
      steps={STEPS}
      title="Como você quer começar?"
      description="Entre numa loja que já existe com um convite ou crie a sua própria loja."
    >
      <div className="flex flex-col gap-4">
        <Choice
          to="/dashboard/signup/convite"
          icon={Ticket}
          title="Tenho um código de convite"
          description="Entrar numa loja que já está no Menuza."
          suggested={persona === "staff"}
        />
        <Choice
          to="/dashboard/signup/loja"
          icon={Store}
          title="Quero criar uma loja"
          description="Começar uma loja nova, do zero."
          suggested={persona === "owner"}
        />
      </div>
    </SignupFrame>
  );
}
