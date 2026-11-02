import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuditTable } from "@/features/audit/components/audit-table.tsx";
import { listAuditLogsFn } from "@/features/audit/server/audit.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/audit")({
  loader: async ({ params }) => {
    const payload = await listAuditLogsFn({ data: { storeSlug: params.storeSlug } });

    // No panel session: the layout already resolved the store, so signing in
    // again is the recovery, not a 404.
    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { logs: payload.logs };
  },
  head: () => ({ meta: [{ title: pageTitle("Auditoria") }] }),
  component: AuditPage,
});

function AuditPage() {
  const { logs } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="audit-heading" className="text-xl font-semibold tracking-tight">
          Auditoria
        </h2>
        <p className="text-sm text-muted-foreground">Trilha de eventos da loja.</p>
      </div>

      <AuditTable storeSlug={storeSlug} logs={logs} />
    </section>
  );
}
