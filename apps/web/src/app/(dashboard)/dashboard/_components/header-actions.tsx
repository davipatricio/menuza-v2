"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { logoutSession } from "@/lib/session-client.ts";

/**
 * Dashboard header actions: jump back to the store picker (store panel only) or
 * end the staff session. Kept in the static shell; the logout call runs at
 * runtime.
 */
export function HeaderActions({ showSwitcher = true }: { showSwitcher?: boolean }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);

    try {
      await logoutSession();
    } finally {
      router.replace("/dashboard/login");
      router.refresh();
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showSwitcher ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/dashboard" aria-label="Trocar de loja" />}
        >
          <Repeat aria-hidden="true" />
          <span className="hidden sm:inline">Trocar de loja</span>
        </Button>
      ) : null}
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
