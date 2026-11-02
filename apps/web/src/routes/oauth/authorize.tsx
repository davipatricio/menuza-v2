import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { ConsentScreen } from "@/features/auth/components/consent-form.tsx";
import { requireSession } from "@/features/auth/lib/require-session.ts";
import { checkRedirectFn } from "@/features/auth/server/authorize.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/oauth/authorize")({
  // SAFETY: raw query record — each key is a string or string[]; normalize() narrows it.
  validateSearch: (search) => search as Record<string, string | string[] | undefined>,
  beforeLoad: async ({ location }) => ({ session: await requireSession(location.href) }),
  loaderDeps: ({ search }) => normalize(search),
  loader: async ({ deps: { clientId, redirectUri } }) => {
    if (!clientId || !redirectUri) return { registered: false };

    return checkRedirectFn({ data: { clientId, redirectUri } });
  },
  head: () => ({ meta: [{ title: pageTitle("Autorizar acesso") }] }),
  component: AuthorizePage,
});

/** Consent frame: the app bar next to login's, with the body left to `ConsentScreen`. */
function AuthorizePage() {
  const { session } = Route.useRouteContext();
  const search = normalize(Route.useSearch());
  const { registered } = Route.useLoaderData();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
        <Link
          to="/"
          className="flex w-fit items-center gap-2 rounded-lg text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Store aria-hidden className="size-6 rounded-lg bg-primary p-1 text-primary-foreground" />
          Menuza
        </Link>
        <ThemeToggle compact />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <ConsentScreen session={session} search={search} registered={registered} />
      </main>
    </div>
  );
}

function normalize(raw: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  return {
    clientId: first(raw.client_id ?? raw.clientId),
    redirectUri: first(raw.redirect_uri ?? raw.redirectUri),
    responseType: first(raw.response_type ?? raw.responseType),
    codeChallenge: first(raw.code_challenge ?? raw.codeChallenge),
    codeChallengeMethod: first(raw.code_challenge_method ?? raw.codeChallengeMethod),
    state: first(raw.state),
    scope: first(raw.scope),
  };
}
