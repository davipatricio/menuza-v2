"use client";

/**
 * Team table. A client island: the server page reads the members and hands them
 * down. `role` arrives as the canonical closed set, and `ROLE_LABELS` is the
 * only place it becomes pt-BR.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { TeamMember } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatDateTime } from "@/lib/format.ts";
import { MEMBER_KIND_LABELS, ROLE_LABELS } from "@/lib/panel-labels.ts";

const columns: ColumnDef<typeof dashboardTableFeatures, TeamMember, unknown>[] = [
  {
    accessorKey: "name",
    header: "Nome",
    cell: ({ row }) => row.original.name ?? row.original.email,
  },
  {
    accessorKey: "email",
    header: "E-mail",
  },
  {
    accessorKey: "role",
    header: "Papel",
    cell: ({ row }) => <Badge variant="secondary">{ROLE_LABELS[row.original.role]}</Badge>,
  },
  {
    accessorKey: "kind",
    header: "Tipo",
    cell: ({ row }) => MEMBER_KIND_LABELS[row.original.kind],
  },
  {
    accessorKey: "joinedAt",
    header: "Entrou em",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatDateTime(row.original.joinedAt)}</span>
    ),
  },
];

export function TeamTable({ members, storeSlug }: { members: TeamMember[]; storeSlug: string }) {
  return (
    <DataTable
      columns={columns}
      data={members}
      tableLabel="Equipe"
      searchPlaceholder="Buscar por nome ou e-mail…"
      searchLabel="Filtrar equipe"
      exportFilename={`equipe-${storeSlug}`}
      exportColumns={[
        { key: "name", label: "Nome", accessor: (r) => r.name ?? r.email },
        { key: "email", label: "E-mail" },
        { key: "role", label: "Papel", accessor: (r) => ROLE_LABELS[r.role] },
        { key: "kind", label: "Tipo", accessor: (r) => MEMBER_KIND_LABELS[r.kind] },
        { key: "joinedAt", label: "Entrou em" },
      ]}
    />
  );
}
