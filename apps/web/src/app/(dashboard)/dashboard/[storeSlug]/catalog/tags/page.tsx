import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { TagsTable } from "./tags-table";

export default async function CatalogTagsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { tags } = await client.panel.listTags({ storeSlug });

  return (
    <section aria-labelledby="tags-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="tags-heading" className="text-xl font-semibold tracking-tight">
          Tags
        </h2>
        <p className="text-sm text-muted-foreground">Tags do catálogo.</p>
      </div>
      <TagsTable tags={tags} />
    </section>
  );
}
