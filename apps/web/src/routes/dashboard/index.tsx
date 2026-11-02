import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/lib/require-session.ts";
import { StorePicker } from "@/features/shell/components/store-picker.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async ({ location }) => ({ session: await requireSession(location.href) }),
  head: () => ({ meta: [{ title: pageTitle("Suas lojas") }] }),
  component: StorePickerPage,
});

/** Store picker. An unauthenticated visitor is sent to the login screen. */
function StorePickerPage() {
  const { session } = Route.useRouteContext();

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <StorePicker session={session} />
      </main>
    </div>
  );
}
