import { TenantStatusCard } from "@/components/tenant-status-card.tsx";

export default function ManagementHome() {
  return (
    <section aria-labelledby="manage-heading" className="space-y-4">
      <h2 id="manage-heading" className="text-xl font-medium">
        Gestão
      </h2>
      <p className="text-neutral-700 dark:text-neutral-300">
        Sessões e RBAC ainda não estão ativos. As APIs de gestão respondem apenas a verificações de
        saúde e rejeitam operações anônimas.
      </p>
      <TenantStatusCard />
    </section>
  );
}
