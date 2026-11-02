/**
 * Header actions: back to the store picker and end the staff session.
 *
 * The logout call runs in the browser and the navigation that follows is a
 * router replace, so the signed-in screen never stays in history.
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { logoutSession } from "@/features/auth/server/session-client.ts";

export function HeaderActions() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);

    try {
      await logoutSession();
    } finally {
      await navigate({ to: "/dashboard/login", search: { returnTo: undefined }, replace: true });
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        render={<Link to="/dashboard" aria-label="Trocar de loja" />}
      >
        <Repeat aria-hidden="true" />
        <span className="hidden sm:inline">Trocar de loja</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Sair da conta"
        disabled={signingOut}
        onClick={handleLogout}
      >
        <LogOut aria-hidden="true" />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </div>
  );
}
