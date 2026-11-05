-- Kits: three composition kinds, one price shape, groups and progressive bands.
--
-- Expand/contract: every new column on "Kit"/"KitItem" is nullable (or carries a
-- default) so the columns can land before any writer knows them. The backfill
-- fills the rows that predate this migration, then the CHECKs and the NOT NULLs
-- pin the shape for every later insert.
--
-- `mode` stays: a later migration drops it once nothing reads it. It gains a
-- default here so an insert that only knows `kind` still satisfies it.

-- ---------------------------------------------------------------- Kit columns

ALTER TABLE public."Kit" ADD COLUMN "slug" text;
ALTER TABLE public."Kit" ADD COLUMN "description" text;
ALTER TABLE public."Kit" ADD COLUMN "imageUrl" text;
ALTER TABLE public."Kit" ADD COLUMN "sortOrder" integer DEFAULT 0 NOT NULL;
ALTER TABLE public."Kit" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;
ALTER TABLE public."Kit" ADD COLUMN "kind" text;
ALTER TABLE public."Kit" ADD COLUMN "pricingMode" text;
ALTER TABLE public."Kit" ADD COLUMN "baseCents" integer;
ALTER TABLE public."Kit" ADD COLUMN "percentOff" integer;
ALTER TABLE public."Kit" ADD COLUMN "minItems" integer;
ALTER TABLE public."Kit" ADD COLUMN "maxItems" integer;
ALTER TABLE public."Kit" ADD COLUMN "maxKitsPerOrder" integer;
ALTER TABLE public."Kit" ADD COLUMN "unavailableBehavior" text;
ALTER TABLE public."Kit" ADD COLUMN "couponStackable" boolean DEFAULT true NOT NULL;
ALTER TABLE public."Kit" ADD COLUMN "updatedAt" timestamp(3) without time zone;

UPDATE public."Kit"
SET "kind" = CASE
        WHEN "mode" = 'build_your_own' THEN 'fixed_total'
        ELSE 'fixed'
    END,
    "slug" = "id",
    "pricingMode" = 'fixed',
    "baseCents" = 0,
    "unavailableBehavior" = 'hide',
    "updatedAt" = now();

ALTER TABLE public."Kit" ALTER COLUMN "mode" SET DEFAULT 'preselected';
ALTER TABLE public."Kit" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE public."Kit" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE public."Kit" ALTER COLUMN "pricingMode" SET NOT NULL;
ALTER TABLE public."Kit" ALTER COLUMN "baseCents" SET NOT NULL;
ALTER TABLE public."Kit" ALTER COLUMN "unavailableBehavior" SET NOT NULL;
ALTER TABLE public."Kit" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public."Kit" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_kind_check" CHECK (("kind" = ANY (ARRAY['fixed'::text, 'custom_quantities'::text, 'fixed_total'::text])));
ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_pricingMode_check" CHECK (("pricingMode" = ANY (ARRAY['fixed'::text, 'sum'::text])));
ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_unavailableBehavior_check" CHECK (("unavailableBehavior" = ANY (ARRAY['hide'::text, 'block'::text])));
ALTER TABLE public."Kit" ADD CONSTRAINT "Kit_baseCents_check" CHECK (("baseCents" >= 0));
ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_percentOff_check" CHECK ((("percentOff" IS NULL) OR (("percentOff" >= 0) AND ("percentOff" <= 100))));
ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_items_bounds_check" CHECK ((("minItems" IS NULL) OR ("maxItems" IS NULL) OR ("minItems" <= "maxItems")));
ALTER TABLE public."Kit"
    ADD CONSTRAINT "Kit_maxKitsPerOrder_check" CHECK ((("maxKitsPerOrder" IS NULL) OR ("maxKitsPerOrder" >= 1)));

CREATE UNIQUE INDEX "Kit_tenantId_slug_key" ON public."Kit" USING btree ("tenantId", "slug");

-- ------------------------------------------------------------ KitItem columns

ALTER TABLE public."KitItem" ADD COLUMN "productId" text;
ALTER TABLE public."KitItem" ADD COLUMN "groupId" text;
ALTER TABLE public."KitItem" ADD COLUMN "minQty" integer;
ALTER TABLE public."KitItem" ADD COLUMN "maxQty" integer;
ALTER TABLE public."KitItem" ADD COLUMN "step" integer DEFAULT 1 NOT NULL;
ALTER TABLE public."KitItem" ADD COLUMN "allowSwap" boolean DEFAULT false NOT NULL;
ALTER TABLE public."KitItem" ADD COLUMN "sortOrder" integer DEFAULT 0 NOT NULL;

UPDATE public."KitItem" AS item
SET "productId" = variation."productId"
FROM public."Variation" AS variation
WHERE variation."id" = item."variationId";

ALTER TABLE public."KitItem" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE public."KitItem" ALTER COLUMN "quantity" DROP NOT NULL;

ALTER TABLE public."KitItem" ADD CONSTRAINT "KitItem_step_check" CHECK (("step" >= 1));
ALTER TABLE public."KitItem"
    ADD CONSTRAINT "KitItem_bounds_check" CHECK (("minQty" IS NULL) OR ("maxQty" IS NULL) OR ("minQty" <= "maxQty"));

CREATE INDEX "KitItem_productId_idx" ON public."KitItem" USING btree ("productId");
CREATE INDEX "KitItem_groupId_idx" ON public."KitItem" USING btree ("groupId");

ALTER TABLE public."KitItem"
    ADD CONSTRAINT "KitItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;
-- --------------------------------------------------------------- New tables

CREATE TABLE public."KitGroup" (
    id text NOT NULL,
    "kitId" text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "minItems" integer,
    "maxItems" integer,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "KitGroup_bounds_check" CHECK ((("minItems" IS NULL) OR ("maxItems" IS NULL) OR ("minItems" <= "maxItems")))
);

ALTER TABLE public."KitGroup" ADD CONSTRAINT "KitGroup_pkey" PRIMARY KEY (id);
ALTER TABLE public."KitGroup"
    ADD CONSTRAINT "KitGroup_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES public."Kit"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."KitGroup"
    ADD CONSTRAINT "KitGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "KitGroup_kitId_idx" ON public."KitGroup" USING btree ("kitId");
CREATE INDEX "KitGroup_tenantId_idx" ON public."KitGroup" USING btree ("tenantId");
ALTER TABLE public."KitItem"
    ADD CONSTRAINT "KitItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."KitGroup"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE TABLE public."KitItemVariation" (
    id text NOT NULL,
    "kitItemId" text NOT NULL,
    "tenantId" text NOT NULL,
    "variationId" text NOT NULL
);

ALTER TABLE public."KitItemVariation" ADD CONSTRAINT "KitItemVariation_pkey" PRIMARY KEY (id);
ALTER TABLE public."KitItemVariation"
    ADD CONSTRAINT "KitItemVariation_kitItemId_variationId_key" UNIQUE ("kitItemId", "variationId");
ALTER TABLE public."KitItemVariation"
    ADD CONSTRAINT "KitItemVariation_kitItemId_fkey" FOREIGN KEY ("kitItemId") REFERENCES public."KitItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."KitItemVariation"
    ADD CONSTRAINT "KitItemVariation_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES public."Variation"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."KitItemVariation"
    ADD CONSTRAINT "KitItemVariation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "KitItemVariation_kitItemId_idx" ON public."KitItemVariation" USING btree ("kitItemId");
CREATE INDEX "KitItemVariation_tenantId_idx" ON public."KitItemVariation" USING btree ("tenantId");
CREATE INDEX "KitItemVariation_variationId_idx" ON public."KitItemVariation" USING btree ("variationId");

CREATE TABLE public."KitDiscountBand" (
    id text NOT NULL,
    "kitId" text NOT NULL,
    "tenantId" text NOT NULL,
    "minQuantity" integer NOT NULL,
    percent integer NOT NULL,
    CONSTRAINT "KitDiscountBand_minQuantity_check" CHECK (("minQuantity" >= 2)),
    CONSTRAINT "KitDiscountBand_percent_check" CHECK ((("percent" >= 1) AND ("percent" <= 100)))
);

ALTER TABLE public."KitDiscountBand" ADD CONSTRAINT "KitDiscountBand_pkey" PRIMARY KEY (id);
ALTER TABLE public."KitDiscountBand"
    ADD CONSTRAINT "KitDiscountBand_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES public."Kit"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."KitDiscountBand"
    ADD CONSTRAINT "KitDiscountBand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "KitDiscountBand_kitId_idx" ON public."KitDiscountBand" USING btree ("kitId");
CREATE INDEX "KitDiscountBand_tenantId_idx" ON public."KitDiscountBand" USING btree ("tenantId");

CREATE TABLE public."CouponKit" (
    "couponId" text NOT NULL,
    "kitId" text NOT NULL,
    "tenantId" text NOT NULL
);

ALTER TABLE public."CouponKit" ADD CONSTRAINT "CouponKit_pkey" PRIMARY KEY ("couponId", "kitId");
ALTER TABLE public."CouponKit"
    ADD CONSTRAINT "CouponKit_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES public."Coupon"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."CouponKit"
    ADD CONSTRAINT "CouponKit_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES public."Kit"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."CouponKit"
    ADD CONSTRAINT "CouponKit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "CouponKit_couponId_idx" ON public."CouponKit" USING btree ("couponId");
CREATE INDEX "CouponKit_kitId_idx" ON public."CouponKit" USING btree ("kitId");
CREATE INDEX "CouponKit_tenantId_idx" ON public."CouponKit" USING btree ("tenantId");

-- ------------------------------------------------------- Tenant join guards
--
-- The baseline guard raises when a join row's tenant disagrees with either
-- parent. These five tables extend that dispatch; the KitGroup and band rows
-- name the kit twice so they keep the same two-parent shape.

CREATE OR REPLACE FUNCTION public.menuza_join_tenant_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  first_tenant text;
  second_tenant text;
BEGIN
  IF TG_TABLE_NAME = 'ProductTag' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Tag" WHERE "id" = NEW."tagId";
  ELSIF TG_TABLE_NAME = 'ProductBadge' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Badge" WHERE "id" = NEW."badgeId";
  ELSIF TG_TABLE_NAME = 'CouponProduct' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Coupon" WHERE "id" = NEW."couponId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
  ELSIF TG_TABLE_NAME = 'CouponKit' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Coupon" WHERE "id" = NEW."couponId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
  ELSIF TG_TABLE_NAME = 'KitGroup' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
  ELSIF TG_TABLE_NAME = 'KitItem' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Variation" WHERE "id" = NEW."variationId";
  ELSIF TG_TABLE_NAME = 'KitItemVariation' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."KitItem" WHERE "id" = NEW."kitItemId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Variation" WHERE "id" = NEW."variationId";
  ELSIF TG_TABLE_NAME = 'KitDiscountBand' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Kit" WHERE "id" = NEW."kitId";
  ELSE
    SELECT "tenantId" INTO first_tenant FROM "public"."Category" WHERE "id" = NEW."categoryId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Department" WHERE "id" = NEW."departmentId";
  END IF;

  IF first_tenant IS NULL
     OR second_tenant IS NULL
     OR first_tenant <> NEW."tenantId"
     OR second_tenant <> NEW."tenantId" THEN
    RAISE EXCEPTION '% row tenant % does not match its parents (%) and (%)',
      TG_TABLE_NAME, NEW."tenantId", first_tenant, second_tenant;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CouponKit_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."CouponKit" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();
CREATE TRIGGER "KitGroup_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."KitGroup" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();
CREATE TRIGGER "KitItem_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."KitItem" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();
CREATE TRIGGER "KitItemVariation_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."KitItemVariation" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();
CREATE TRIGGER "KitDiscountBand_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."KitDiscountBand" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();
