import type { SessionMember, SessionMembership } from "@menuza/api-client/model";
import {
  getTenantSession,
  loginTenantSession,
  logoutTenantSession,
} from "@menuza/api-client/tenant";
import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { bindSessionToken, sessionTokenFrom } from "./api.ts";

const TOKEN_KEY = "menuza.dashboard.token";

const STORE_KEY = "menuza.dashboard.store";

type SessionStatus = "loading" | "anonymous" | "authenticated";

interface Session {
  status: SessionStatus;
  member: SessionMember | null;
  memberships: SessionMembership[];
  storeSlug: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectStore: (slug: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const value = use(SessionContext);

  if (!value) throw new Error("useSession was called outside SessionProvider");

  return value;
}

/** The store the operator picked, or the only one they hold. */
function pickStore(memberships: SessionMembership[], saved: string | null): string | null {
  if (saved && memberships.some((membership) => membership.tenantSlug === saved)) return saved;

  return memberships.length === 1 ? (memberships.at(0)?.tenantSlug ?? null) : null;
}

/**
 * The operator session: a tenant cookie kept in SecureStore, verified against
 * `/session/current` on boot, never read from the JS bundle.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [member, setMember] = useState<SessionMember | null>(null);
  const [memberships, setMemberships] = useState<SessionMembership[]>([]);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);

      if (!token) {
        if (!cancelled) setStatus("anonymous");

        return;
      }

      bindSessionToken(token);

      const response = await getTenantSession().catch(() => null);

      if (!response || response.status !== 200) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        bindSessionToken(null);

        if (!cancelled) setStatus("anonymous");

        return;
      }

      if (cancelled) return;

      setMember(response.data.member);
      setMemberships(response.data.memberships);
      setStoreSlug(pickStore(response.data.memberships, await Storage.getItem(STORE_KEY)));
      setStatus("authenticated");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(email: string, password: string) {
    const response = await loginTenantSession({ email, password });

    if (response.status !== 200) {
      throw new Error("E-mail ou senha incorretos.");
    }

    const token = sessionTokenFrom(response.headers);

    if (!token) throw new Error("A resposta de login não abriu uma sessão.");

    // A member switching accounts on a shared device never sees the previous
    // account's rows while the new session loads.
    queryClient.clear();
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    bindSessionToken(token);

    setMember(response.data.member);
    setMemberships(response.data.memberships);
    setStoreSlug(pickStore(response.data.memberships, null));
    setStatus("authenticated");
  }

  async function signOut() {
    await logoutTenantSession().catch(() => null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await Storage.removeItem(STORE_KEY);
    bindSessionToken(null);

    // The cache is persisted in SQLite; dropping it is what stops the next
    // member on this device from reading the previous one's orders.
    queryClient.clear();

    setMember(null);
    setMemberships([]);
    setStoreSlug(null);
    setStatus("anonymous");
  }

  function selectStore(slug: string) {
    void Storage.setItem(STORE_KEY, slug);
    setStoreSlug(slug);
  }

  return (
    <SessionContext
      value={{ status, member, memberships, storeSlug, signIn, signOut, selectStore }}
    >
      {children}
    </SessionContext>
  );
}
