-- Extra `<link>` relations for an entity's page, alongside the single canonical
-- URL stored in `SeoMeta`. Only pages with their own URL (product, kit) carry
-- them; every other entity keeps the canonical-only shape.

CREATE TABLE public."SeoLink" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    rel text NOT NULL,
    href text NOT NULL,
    hreflang text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "SeoLink_pkey" PRIMARY KEY (id),
    CONSTRAINT "SeoLink_entityType_check" CHECK (("entityType" = ANY (ARRAY['product'::text, 'kit'::text]))),
    CONSTRAINT "SeoLink_rel_check" CHECK ((rel = ANY (ARRAY['alternate'::text, 'sameAs'::text, 'related'::text]))),
    CONSTRAINT "SeoLink_href_check" CHECK ((href ~* '^https?://')),
    CONSTRAINT "SeoLink_sortOrder_check" CHECK (("sortOrder" >= 0))
);

ALTER TABLE ONLY public."SeoLink"
    ADD CONSTRAINT "SeoLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "SeoLink_tenant_entity_idx"
    ON public."SeoLink" ("tenantId", "entityType", "entityId", "sortOrder");
