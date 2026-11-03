-- Menuza baseline: the Prisma-era `public` schema, frozen at the Rust cutover.
-- `sqlx migrate run` applies this to a fresh database; databases that already
-- carry the schema are marked as applied manually (see ADR-0007).
-- Append-only from here: never edit this file, add a new migration instead.

CREATE FUNCTION public.menuza_join_tenant_guard() RETURNS trigger
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

CREATE TABLE public."AuditLog" (
    action text NOT NULL,
    actor text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    ip text NOT NULL,
    target text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."Badge" (
    id text NOT NULL,
    "imageUrl" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "tenantId" text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."CategoryDepartment" (
    "categoryId" text NOT NULL,
    "departmentId" text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."Coupon" (
    code text NOT NULL,
    "discountType" text NOT NULL,
    id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    "tenantId" text NOT NULL,
    "usageCount" integer DEFAULT 0 NOT NULL,
    value integer NOT NULL,
    description text,
    "endsAt" timestamp(3) without time zone,
    "firstPurchaseOnly" boolean DEFAULT false NOT NULL,
    "maximumDiscountCents" integer,
    "minimumOrderCents" integer,
    "perCustomerLimit" integer,
    stackable boolean DEFAULT false NOT NULL,
    "startsAt" timestamp(3) without time zone,
    "usageLimit" integer,
    "shippingDiscountPercent" integer,
    "productScopeMode" text DEFAULT 'include'::text NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    CONSTRAINT "Coupon_discountType_check_60789bc4" CHECK (("discountType" = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
    CONSTRAINT "Coupon_status_check_8b06f885" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'disabled'::text]))),
    CONSTRAINT coupon_maximum_discount_non_negative_7254daa1 CHECK ((("maximumDiscountCents" IS NULL) OR ("maximumDiscountCents" >= 0))),
    CONSTRAINT coupon_minimum_order_non_negative_6ec4ce93 CHECK ((("minimumOrderCents" IS NULL) OR ("minimumOrderCents" >= 0))),
    CONSTRAINT coupon_per_customer_limit_positive_4fd252ba CHECK ((("perCustomerLimit" IS NULL) OR ("perCustomerLimit" > 0))),
    CONSTRAINT coupon_percentage_within_hundred_77f17b3a CHECK ((("discountType" <> 'percentage'::text) OR (value <= 100))),
    CONSTRAINT coupon_product_scope_mode_valid_79b7f4e5 CHECK (("productScopeMode" = ANY (ARRAY['include'::text, 'exclude'::text]))),
    CONSTRAINT coupon_shipping_discount_within_hundred_9f202eae CHECK ((("shippingDiscountPercent" IS NULL) OR (("shippingDiscountPercent" >= 0) AND ("shippingDiscountPercent" <= 100)))),
    CONSTRAINT coupon_usage_limit_positive_443593df CHECK ((("usageLimit" IS NULL) OR ("usageLimit" > 0))),
    CONSTRAINT coupon_value_non_negative_95f49512 CHECK ((value >= 0))
);

CREATE TABLE public."CouponProduct" (
    "couponId" text NOT NULL,
    "productId" text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."CouponRedemption" (
    "couponId" text NOT NULL,
    "customerId" text NOT NULL,
    "discountCents" integer NOT NULL,
    id text NOT NULL,
    "orderId" text NOT NULL,
    "tenantId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."Customer" (
    email text NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."Department" (
    id text NOT NULL,
    name text NOT NULL,
    "tenantId" text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."Domain" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    host text NOT NULL,
    id text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."GatewayEvent" (
    "amountCents" integer,
    detail text,
    "externalId" text NOT NULL,
    id text NOT NULL,
    "integrationId" text NOT NULL,
    "orderCode" text,
    "processedAt" timestamp(3) without time zone,
    provider text NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    "tenantId" text NOT NULL,
    type text NOT NULL,
    CONSTRAINT "GatewayEvent_provider_check_59ce43d4" CHECK ((provider = ANY (ARRAY['pagarme'::text, 'offline'::text]))),
    CONSTRAINT "GatewayEvent_status_check_11ff3856" CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'rejected'::text, 'failed'::text])))
);

CREATE TABLE public."Kit" (
    available boolean DEFAULT true NOT NULL,
    id text NOT NULL,
    mode text NOT NULL,
    name text NOT NULL,
    "tenantId" text NOT NULL,
    CONSTRAINT "Kit_mode_check_9edd585a" CHECK ((mode = ANY (ARRAY['preselected'::text, 'build_your_own'::text])))
);

CREATE TABLE public."KitItem" (
    id text NOT NULL,
    "kitId" text NOT NULL,
    quantity integer NOT NULL,
    "tenantId" text NOT NULL,
    "variationId" text NOT NULL,
    CONSTRAINT kit_item_quantity_positive_fc510296 CHECK ((quantity > 0))
);

CREATE TABLE public."McpSession" (
    "clientName" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "integrationId" text NOT NULL,
    label text NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "memberId" text NOT NULL,
    "oauthTokenId" text NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "tenantId" text NOT NULL,
    "tokenDigest" text NOT NULL
);

CREATE TABLE public."MealSubscription" (
    cadence text NOT NULL,
    "customerId" text NOT NULL,
    id text NOT NULL,
    status text NOT NULL,
    "tenantId" text NOT NULL,
    CONSTRAINT "MealSubscription_cadence_check_1a8bf214" CHECK ((cadence = ANY (ARRAY['weekly'::text, 'monthly'::text]))),
    CONSTRAINT "MealSubscription_status_check_ad1d4a16" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'canceled'::text])))
);

CREATE TABLE public."Member" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    id text NOT NULL,
    "passwordHash" text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    kind text DEFAULT 'human'::text NOT NULL,
    name text,
    birthdate timestamp(3) without time zone
);

CREATE TABLE public."MemberIdentity" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL
);

CREATE TABLE public."MemberOnboarding" (
    "completedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    persona text NOT NULL,
    referral text,
    segment text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."OAuthAuthCode" (
    "clientId" text NOT NULL,
    "codeChallenge" text NOT NULL,
    "codeChallengeMethod" text NOT NULL,
    "codeHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    "redirectUri" text NOT NULL,
    scopes text[] NOT NULL,
    "tenantIds" text[] NOT NULL,
    CONSTRAINT "OAuthAuthCode_scopes_elem_not_null_de6fcc8e" CHECK ((array_position(scopes, NULL::text) IS NULL)),
    CONSTRAINT "OAuthAuthCode_tenantIds_elem_not_null_48f162d4" CHECK ((array_position("tenantIds", NULL::text) IS NULL))
);

CREATE TABLE public."OAuthClient" (
    "clientId" text NOT NULL,
    "clientSecretHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "isPublic" boolean DEFAULT true NOT NULL,
    name text NOT NULL,
    "redirectUris" text[] NOT NULL,
    CONSTRAINT "OAuthClient_redirectUris_elem_not_null_57e7d982" CHECK ((array_position("redirectUris", NULL::text) IS NULL))
);

CREATE TABLE public."OAuthToken" (
    "accessTokenHash" text NOT NULL,
    "clientId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    "refreshTokenHash" text,
    "revokedAt" timestamp(3) without time zone,
    scopes text[] NOT NULL,
    "tenantIds" text[] NOT NULL,
    CONSTRAINT "OAuthToken_scopes_elem_not_null_de6fcc8e" CHECK ((array_position(scopes, NULL::text) IS NULL)),
    CONSTRAINT "OAuthToken_tenantIds_elem_not_null_48f162d4" CHECK ((array_position("tenantIds", NULL::text) IS NULL))
);

CREATE TABLE public."Order" (
    code text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "customerId" text NOT NULL,
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "totalCents" integer NOT NULL,
    "cashbackCents" integer DEFAULT 0 NOT NULL,
    "couponId" text,
    "discountCents" integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    "paymentMethod" text,
    "shippingCents" integer DEFAULT 0 NOT NULL,
    "walletAppliedCents" integer DEFAULT 0 NOT NULL,
    "financialStatus" text NOT NULL,
    "fulfilmentStatus" text NOT NULL,
    "subtotalCents" integer NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "Order_financialStatus_check_0d3e40f8" CHECK (("financialStatus" = ANY (ARRAY['pending'::text, 'awaiting_payment'::text, 'pending_on_delivery'::text, 'paid'::text, 'refunded'::text, 'expired'::text, 'canceled'::text]))),
    CONSTRAINT "Order_fulfilmentStatus_check_8d6331ae" CHECK (("fulfilmentStatus" = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'ready_for_pickup'::text, 'out_for_delivery'::text, 'completed'::text, 'canceled'::text]))),
    CONSTRAINT "Order_paymentMethod_check_f6d9452e" CHECK (("paymentMethod" = ANY (ARRAY['pix'::text, 'credit'::text, 'debit'::text, 'meal_voucher'::text, 'food_voucher'::text, 'boleto'::text, 'cash_on_delivery'::text, 'card_on_delivery'::text]))),
    CONSTRAINT order_cashback_non_negative_4bb14f5b CHECK (("cashbackCents" >= 0)),
    CONSTRAINT order_discount_non_negative_c4cb812b CHECK (("discountCents" >= 0)),
    CONSTRAINT order_shipping_non_negative_7933259a CHECK (("shippingCents" >= 0)),
    CONSTRAINT order_subtotal_non_negative_ad011395 CHECK (("subtotalCents" >= 0)),
    CONSTRAINT order_total_matches_lines_570dca53 CHECK (("totalCents" = ((("subtotalCents" - "discountCents") + "shippingCents") - "walletAppliedCents"))),
    CONSTRAINT order_total_non_negative_192983b0 CHECK (("totalCents" >= 0)),
    CONSTRAINT order_wallet_applied_non_negative_c45f4ae9 CHECK (("walletAppliedCents" >= 0))
);

CREATE TABLE public."OrderEvent" (
    "actorMemberId" text,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    detail text,
    "fromValue" text,
    id text NOT NULL,
    "orderId" text NOT NULL,
    reason text,
    "tenantId" text NOT NULL,
    "toValue" text,
    type text NOT NULL,
    CONSTRAINT "OrderEvent_type_check_d52305fd" CHECK ((type = ANY (ARRAY['financial_changed'::text, 'fulfilment_changed'::text, 'payment_recorded'::text, 'refunded'::text, 'cashback_credited'::text, 'cashback_reversed'::text, 'wallet_reserved'::text, 'wallet_released'::text, 'note'::text])))
);

CREATE TABLE public."OrderItem" (
    id text NOT NULL,
    "kitId" text,
    "lineTotalCents" integer NOT NULL,
    name text NOT NULL,
    "optionsLabel" text,
    "orderId" text NOT NULL,
    "productId" text,
    quantity integer NOT NULL,
    "tenantId" text NOT NULL,
    "unitPriceCents" integer NOT NULL,
    "variationId" text,
    CONSTRAINT order_item_line_total_non_negative_86cf5b60 CHECK (("lineTotalCents" >= 0)),
    CONSTRAINT order_item_quantity_positive_fc510296 CHECK ((quantity > 0))
);

CREATE TABLE public."PaymentIntegration" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    credentials text,
    id text NOT NULL,
    label text NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "webhookToken" text NOT NULL,
    CONSTRAINT "PaymentIntegration_provider_check_59ce43d4" CHECK ((provider = ANY (ARRAY['pagarme'::text, 'offline'::text]))),
    CONSTRAINT "PaymentIntegration_status_check_39370351" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE public."PaymentMethodAssignment" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "integrationId" text NOT NULL,
    method text NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "PaymentMethodAssignment_method_check_e4b3b3b0" CHECK ((method = ANY (ARRAY['pix'::text, 'credit'::text, 'debit'::text, 'meal_voucher'::text, 'food_voucher'::text, 'boleto'::text, 'cash_on_delivery'::text, 'card_on_delivery'::text])))
);

CREATE TABLE public."Product" (
    available boolean DEFAULT true NOT NULL,
    description text,
    id text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "tenantId" text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    private boolean DEFAULT false NOT NULL,
    "subcategoryId" text,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "imageUrl" text
);

CREATE TABLE public."ProductBadge" (
    "badgeId" text NOT NULL,
    "productId" text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."ProductNutrition" (
    "addedSugarsMg" integer,
    basis text DEFAULT 'solid'::text NOT NULL,
    "carbsMg" integer,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "energyKcal" integer,
    "fiberMg" integer,
    "householdMeasure" text,
    id text NOT NULL,
    "labelFormat" text DEFAULT 'vertical'::text NOT NULL,
    notes text,
    "portionMilli" integer,
    "productId" text NOT NULL,
    "proteinMg" integer,
    published boolean DEFAULT false NOT NULL,
    "referenceAt" timestamp(3) without time zone,
    "saturatedFatMg" integer,
    "servingsPerPack" integer,
    "showHighAddedSugar" boolean DEFAULT false NOT NULL,
    "showHighSatFat" boolean DEFAULT false NOT NULL,
    "showHighSodium" boolean DEFAULT false NOT NULL,
    "sodiumMg" integer,
    source text DEFAULT 'manual'::text NOT NULL,
    "tenantId" text NOT NULL,
    "totalFatMg" integer,
    "totalSugarsMg" integer,
    "transFatMg" integer,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ProductNutrition_basis_check_68e7bd4f" CHECK ((basis = ANY (ARRAY['solid'::text, 'liquid'::text]))),
    CONSTRAINT "ProductNutrition_labelFormat_check_0c42dc77" CHECK (("labelFormat" = ANY (ARRAY['vertical'::text, 'simplified'::text]))),
    CONSTRAINT "ProductNutrition_source_check_6cb8808f" CHECK ((source = ANY (ARRAY['manual'::text, 'lab'::text, 'supplier_label'::text, 'database'::text, 'estimate'::text]))),
    CONSTRAINT product_nutrition_added_sugars_lte_total_3f18961d CHECK ((("addedSugarsMg" IS NULL) OR ("totalSugarsMg" IS NULL) OR ("addedSugarsMg" <= "totalSugarsMg"))),
    CONSTRAINT product_nutrition_added_sugars_non_negative_022bd555 CHECK ((("addedSugarsMg" IS NULL) OR ("addedSugarsMg" >= 0))),
    CONSTRAINT product_nutrition_carbs_non_negative_d82b29bb CHECK ((("carbsMg" IS NULL) OR ("carbsMg" >= 0))),
    CONSTRAINT product_nutrition_energy_non_negative_6b58d52b CHECK ((("energyKcal" IS NULL) OR ("energyKcal" >= 0))),
    CONSTRAINT product_nutrition_fat_sum_fd3e689b CHECK ((("saturatedFatMg" IS NULL) OR ("transFatMg" IS NULL) OR ("totalFatMg" IS NULL) OR (("saturatedFatMg" + "transFatMg") <= "totalFatMg"))),
    CONSTRAINT product_nutrition_fiber_non_negative_ac7b8695 CHECK ((("fiberMg" IS NULL) OR ("fiberMg" >= 0))),
    CONSTRAINT product_nutrition_portion_positive_46e9a389 CHECK ((("portionMilli" IS NULL) OR ("portionMilli" > 0))),
    CONSTRAINT product_nutrition_protein_non_negative_b0d9690e CHECK ((("proteinMg" IS NULL) OR ("proteinMg" >= 0))),
    CONSTRAINT product_nutrition_saturated_fat_non_negative_da7b6a18 CHECK ((("saturatedFatMg" IS NULL) OR ("saturatedFatMg" >= 0))),
    CONSTRAINT product_nutrition_servings_positive_ab1dd3a8 CHECK ((("servingsPerPack" IS NULL) OR ("servingsPerPack" > 0))),
    CONSTRAINT product_nutrition_sodium_non_negative_2c6d9761 CHECK ((("sodiumMg" IS NULL) OR ("sodiumMg" >= 0))),
    CONSTRAINT product_nutrition_total_fat_non_negative_402e18d5 CHECK ((("totalFatMg" IS NULL) OR ("totalFatMg" >= 0))),
    CONSTRAINT product_nutrition_total_sugars_non_negative_aa52d3a2 CHECK ((("totalSugarsMg" IS NULL) OR ("totalSugarsMg" >= 0))),
    CONSTRAINT product_nutrition_trans_fat_non_negative_5ffb64c8 CHECK ((("transFatMg" IS NULL) OR ("transFatMg" >= 0)))
);

CREATE TABLE public."ProductTag" (
    "productId" text NOT NULL,
    "tagId" text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."PushPreference" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    event text NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."PushSubscription" (
    auth text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    endpoint text NOT NULL,
    "expirationTime" timestamp(3) without time zone,
    id text NOT NULL,
    "memberId" text NOT NULL,
    p256dh text NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."SeoMeta" (
    "canonicalUrl" text,
    description text,
    "entityId" text NOT NULL,
    "entityType" text NOT NULL,
    id text NOT NULL,
    "jsonLd" text,
    "socialImageUrl" text,
    "tenantId" text NOT NULL,
    title text,
    CONSTRAINT "SeoMeta_entityType_check_c2bacec7" CHECK (("entityType" = ANY (ARRAY['store'::text, 'department'::text, 'category'::text, 'tag'::text, 'product'::text, 'kit'::text, 'coupon'::text])))
);

CREATE TABLE public."Session" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    namespace text NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "lastUsedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."StoreIntegration" (
    config text,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "enabledAt" timestamp(3) without time zone,
    id text NOT NULL,
    "integrationId" text NOT NULL,
    status text DEFAULT 'disabled'::text NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "StoreIntegration_status_check_7d6cabce" CHECK ((status = ANY (ARRAY['enabled'::text, 'disabled'::text, 'paused'::text, 'error'::text])))
);

CREATE TABLE public."StoreSettings" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "seoDescriptionTemplate" text,
    "seoSocialImageUrl" text,
    "seoTitleTemplate" text,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Subcategory" (
    active boolean DEFAULT true NOT NULL,
    "categoryId" text NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."Tag" (
    id text NOT NULL,
    name text NOT NULL,
    "tenantId" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."Tenant" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "displayName" text NOT NULL,
    id text NOT NULL,
    slug text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."TenantMembership" (
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    "memberId" text NOT NULL,
    role text NOT NULL,
    "tenantId" text NOT NULL
);

CREATE TABLE public."Variation" (
    id text NOT NULL,
    name text NOT NULL,
    "priceCents" integer NOT NULL,
    "productId" text NOT NULL,
    "stockMode" text NOT NULL,
    "stockQty" integer,
    "tenantId" text NOT NULL,
    CONSTRAINT "Variation_stockMode_check_676ccf03" CHECK (("stockMode" = ANY (ARRAY['controlled'::text, 'unlimited'::text]))),
    CONSTRAINT variation_price_non_negative_e06f6a4c CHECK (("priceCents" >= 0)),
    CONSTRAINT variation_stock_mode_consistent_e90ad844 CHECK (((("stockMode" = 'unlimited'::text) AND ("stockQty" IS NULL)) OR (("stockMode" = 'controlled'::text) AND ("stockQty" IS NOT NULL)))),
    CONSTRAINT variation_stock_non_negative_10ee5556 CHECK ((("stockQty" IS NULL) OR ("stockQty" >= 0)))
);

CREATE TABLE public."Wallet" (
    "balanceCents" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "customerId" text NOT NULL,
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT wallet_balance_non_negative_0339119a CHECK (("balanceCents" >= 0))
);

CREATE TABLE public."WalletTransaction" (
    "actorMemberId" text,
    "amountCents" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    kind text NOT NULL,
    "orderId" text,
    reason text,
    "tenantId" text NOT NULL,
    "walletId" text NOT NULL,
    CONSTRAINT "WalletTransaction_kind_check_b5bcca69" CHECK ((kind = ANY (ARRAY['cashback_credit'::text, 'store_credit'::text, 'reserve'::text, 'reserve_release'::text, 'spend'::text, 'reversal'::text, 'adjustment'::text])))
);

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_tenantId_name_key" UNIQUE ("tenantId", name);

ALTER TABLE ONLY public."CategoryDepartment"
    ADD CONSTRAINT "CategoryDepartment_pkey" PRIMARY KEY ("categoryId", "departmentId");

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_tenantId_name_key" UNIQUE ("tenantId", name);

ALTER TABLE ONLY public."CouponProduct"
    ADD CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("couponId", "productId");

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_couponId_orderId_key" UNIQUE ("couponId", "orderId");

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Coupon"
    ADD CONSTRAINT "Coupon_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Coupon"
    ADD CONSTRAINT "Coupon_tenantId_code_key" UNIQUE ("tenantId", code);

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_tenantId_email_key" UNIQUE ("tenantId", email);

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_tenantId_name_key" UNIQUE ("tenantId", name);

ALTER TABLE ONLY public."Domain"
    ADD CONSTRAINT "Domain_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."GatewayEvent"
    ADD CONSTRAINT "GatewayEvent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."GatewayEvent"
    ADD CONSTRAINT "GatewayEvent_tenantId_provider_externalId_key" UNIQUE ("tenantId", provider, "externalId");

ALTER TABLE ONLY public."KitItem"
    ADD CONSTRAINT "KitItem_kitId_variationId_key" UNIQUE ("kitId", "variationId");

ALTER TABLE ONLY public."KitItem"
    ADD CONSTRAINT "KitItem_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Kit"
    ADD CONSTRAINT "Kit_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."McpSession"
    ADD CONSTRAINT "McpSession_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."MealSubscription"
    ADD CONSTRAINT "MealSubscription_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."MemberIdentity"
    ADD CONSTRAINT "MemberIdentity_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."MemberOnboarding"
    ADD CONSTRAINT "MemberOnboarding_memberId_key" UNIQUE ("memberId");

ALTER TABLE ONLY public."MemberOnboarding"
    ADD CONSTRAINT "MemberOnboarding_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Member"
    ADD CONSTRAINT "Member_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OAuthAuthCode"
    ADD CONSTRAINT "OAuthAuthCode_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OAuthClient"
    ADD CONSTRAINT "OAuthClient_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OAuthToken"
    ADD CONSTRAINT "OAuthToken_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OrderEvent"
    ADD CONSTRAINT "OrderEvent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_tenantId_code_key" UNIQUE ("tenantId", code);

ALTER TABLE ONLY public."PaymentIntegration"
    ADD CONSTRAINT "PaymentIntegration_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PaymentIntegration"
    ADD CONSTRAINT "PaymentIntegration_webhookToken_key" UNIQUE ("webhookToken");

ALTER TABLE ONLY public."PaymentMethodAssignment"
    ADD CONSTRAINT "PaymentMethodAssignment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PaymentMethodAssignment"
    ADD CONSTRAINT "PaymentMethodAssignment_tenantId_method_key" UNIQUE ("tenantId", method);

ALTER TABLE ONLY public."ProductBadge"
    ADD CONSTRAINT "ProductBadge_pkey" PRIMARY KEY ("productId", "badgeId");

ALTER TABLE ONLY public."ProductNutrition"
    ADD CONSTRAINT "ProductNutrition_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ProductNutrition"
    ADD CONSTRAINT "ProductNutrition_productId_key" UNIQUE ("productId");

ALTER TABLE ONLY public."ProductTag"
    ADD CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("productId", "tagId");

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PushPreference"
    ADD CONSTRAINT "PushPreference_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PushSubscription"
    ADD CONSTRAINT "PushSubscription_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SeoMeta"
    ADD CONSTRAINT "SeoMeta_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SeoMeta"
    ADD CONSTRAINT "SeoMeta_tenantId_entityType_entityId_key" UNIQUE ("tenantId", "entityType", "entityId");

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."StoreIntegration"
    ADD CONSTRAINT "StoreIntegration_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."StoreIntegration"
    ADD CONSTRAINT "StoreIntegration_tenantId_integrationId_key" UNIQUE ("tenantId", "integrationId");

ALTER TABLE ONLY public."StoreSettings"
    ADD CONSTRAINT "StoreSettings_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."StoreSettings"
    ADD CONSTRAINT "StoreSettings_tenantId_key" UNIQUE ("tenantId");

ALTER TABLE ONLY public."Subcategory"
    ADD CONSTRAINT "Subcategory_categoryId_name_key" UNIQUE ("categoryId", name);

ALTER TABLE ONLY public."Subcategory"
    ADD CONSTRAINT "Subcategory_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_tenantId_name_key" UNIQUE ("tenantId", name);

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Variation"
    ADD CONSTRAINT "Variation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Variation"
    ADD CONSTRAINT "Variation_productId_name_key" UNIQUE ("productId", name);

ALTER TABLE ONLY public."WalletTransaction"
    ADD CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_tenantId_customerId_key" UNIQUE ("tenantId", "customerId");

CREATE INDEX "AuditLog_tenantId_idx" ON public."AuditLog" USING btree ("tenantId");

CREATE INDEX "Badge_tenantId_idx" ON public."Badge" USING btree ("tenantId");

CREATE INDEX "CategoryDepartment_categoryId_idx_15c304f2" ON public."CategoryDepartment" USING btree ("categoryId");

CREATE INDEX "CategoryDepartment_departmentId_idx" ON public."CategoryDepartment" USING btree ("departmentId");

CREATE INDEX "CategoryDepartment_tenantId_idx" ON public."CategoryDepartment" USING btree ("tenantId");

CREATE INDEX "Category_tenantId_idx" ON public."Category" USING btree ("tenantId");

CREATE INDEX "CouponProduct_couponId_idx_a9dd19dc" ON public."CouponProduct" USING btree ("couponId");

CREATE INDEX "CouponProduct_productId_idx_5858600a" ON public."CouponProduct" USING btree ("productId");

CREATE INDEX "CouponProduct_tenantId_idx" ON public."CouponProduct" USING btree ("tenantId");

CREATE INDEX "CouponProduct_tenantId_productId_idx" ON public."CouponProduct" USING btree ("tenantId", "productId");

CREATE INDEX "CouponRedemption_couponId_customerId_idx" ON public."CouponRedemption" USING btree ("couponId", "customerId");

CREATE INDEX "CouponRedemption_couponId_idx_a9dd19dc" ON public."CouponRedemption" USING btree ("couponId");

CREATE INDEX "CouponRedemption_customerId_idx_b2a8a46c" ON public."CouponRedemption" USING btree ("customerId");

CREATE INDEX "CouponRedemption_orderId_idx_d284871b" ON public."CouponRedemption" USING btree ("orderId");

CREATE INDEX "CouponRedemption_tenantId_createdAt_idx" ON public."CouponRedemption" USING btree ("tenantId", "createdAt");

CREATE INDEX "CouponRedemption_tenantId_idx" ON public."CouponRedemption" USING btree ("tenantId");

CREATE INDEX "Coupon_tenantId_deletedAt_idx" ON public."Coupon" USING btree ("tenantId", "deletedAt");

CREATE INDEX "Coupon_tenantId_idx" ON public."Coupon" USING btree ("tenantId");

CREATE INDEX "Customer_tenantId_idx" ON public."Customer" USING btree ("tenantId");

CREATE INDEX "Department_tenantId_idx" ON public."Department" USING btree ("tenantId");

CREATE UNIQUE INDEX "Domain_host_key" ON public."Domain" USING btree (host);

CREATE INDEX "Domain_tenantId_idx" ON public."Domain" USING btree ("tenantId");

CREATE INDEX "GatewayEvent_integrationId_idx" ON public."GatewayEvent" USING btree ("integrationId");

CREATE INDEX "GatewayEvent_tenantId_idx" ON public."GatewayEvent" USING btree ("tenantId");

CREATE INDEX "KitItem_kitId_idx_60437f65" ON public."KitItem" USING btree ("kitId");

CREATE INDEX "KitItem_tenantId_idx" ON public."KitItem" USING btree ("tenantId");

CREATE INDEX "KitItem_variationId_idx" ON public."KitItem" USING btree ("variationId");

CREATE INDEX "Kit_tenantId_idx" ON public."Kit" USING btree ("tenantId");

CREATE INDEX "McpSession_memberId_idx" ON public."McpSession" USING btree ("memberId");

CREATE INDEX "McpSession_tenantId_idx_c93ed4f1" ON public."McpSession" USING btree ("tenantId");

CREATE INDEX "McpSession_tenantId_integrationId_idx" ON public."McpSession" USING btree ("tenantId", "integrationId");

CREATE UNIQUE INDEX "McpSession_tokenDigest_key" ON public."McpSession" USING btree ("tokenDigest");

CREATE INDEX "MealSubscription_customerId_idx" ON public."MealSubscription" USING btree ("customerId");

CREATE INDEX "MealSubscription_tenantId_idx" ON public."MealSubscription" USING btree ("tenantId");

CREATE INDEX "MemberIdentity_memberId_idx" ON public."MemberIdentity" USING btree ("memberId");

CREATE UNIQUE INDEX "MemberIdentity_provider_providerAccountId_key" ON public."MemberIdentity" USING btree (provider, "providerAccountId");

CREATE UNIQUE INDEX "Member_email_key" ON public."Member" USING btree (email);

CREATE INDEX "OAuthAuthCode_clientId_idx_153a9a49" ON public."OAuthAuthCode" USING btree ("clientId");

CREATE UNIQUE INDEX "OAuthAuthCode_codeHash_key" ON public."OAuthAuthCode" USING btree ("codeHash");

CREATE INDEX "OAuthAuthCode_expiresAt_idx" ON public."OAuthAuthCode" USING btree ("expiresAt");

CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON public."OAuthClient" USING btree ("clientId");

CREATE UNIQUE INDEX "OAuthToken_accessTokenHash_key" ON public."OAuthToken" USING btree ("accessTokenHash");

CREATE INDEX "OAuthToken_clientId_idx_153a9a49" ON public."OAuthToken" USING btree ("clientId");

CREATE INDEX "OAuthToken_expiresAt_idx" ON public."OAuthToken" USING btree ("expiresAt");

CREATE UNIQUE INDEX "OAuthToken_refreshTokenHash_key" ON public."OAuthToken" USING btree ("refreshTokenHash");

CREATE INDEX "OrderEvent_orderId_idx" ON public."OrderEvent" USING btree ("orderId");

CREATE INDEX "OrderEvent_tenantId_idx" ON public."OrderEvent" USING btree ("tenantId");

CREATE INDEX "OrderItem_kitId_idx_60437f65" ON public."OrderItem" USING btree ("kitId");

CREATE INDEX "OrderItem_orderId_idx" ON public."OrderItem" USING btree ("orderId");

CREATE INDEX "OrderItem_productId_idx_5858600a" ON public."OrderItem" USING btree ("productId");

CREATE INDEX "OrderItem_tenantId_idx" ON public."OrderItem" USING btree ("tenantId");

CREATE INDEX "OrderItem_variationId_idx_a2646852" ON public."OrderItem" USING btree ("variationId");

CREATE INDEX "Order_couponId_idx_a9dd19dc" ON public."Order" USING btree ("couponId");

CREATE INDEX "Order_customerId_idx" ON public."Order" USING btree ("customerId");

CREATE INDEX "Order_tenantId_idx" ON public."Order" USING btree ("tenantId");

CREATE INDEX "PaymentIntegration_tenantId_idx" ON public."PaymentIntegration" USING btree ("tenantId");

CREATE INDEX "PaymentMethodAssignment_integrationId_idx" ON public."PaymentMethodAssignment" USING btree ("integrationId");

CREATE INDEX "PaymentMethodAssignment_tenantId_idx" ON public."PaymentMethodAssignment" USING btree ("tenantId");

CREATE INDEX "ProductBadge_badgeId_idx" ON public."ProductBadge" USING btree ("badgeId");

CREATE INDEX "ProductBadge_productId_idx_5858600a" ON public."ProductBadge" USING btree ("productId");

CREATE INDEX "ProductBadge_tenantId_idx" ON public."ProductBadge" USING btree ("tenantId");

CREATE INDEX "ProductNutrition_tenantId_idx" ON public."ProductNutrition" USING btree ("tenantId");

CREATE INDEX "ProductTag_productId_idx_5858600a" ON public."ProductTag" USING btree ("productId");

CREATE INDEX "ProductTag_tagId_idx" ON public."ProductTag" USING btree ("tagId");

CREATE INDEX "ProductTag_tenantId_idx" ON public."ProductTag" USING btree ("tenantId");

CREATE INDEX "Product_subcategoryId_idx" ON public."Product" USING btree ("subcategoryId");

CREATE INDEX "Product_tenantId_idx" ON public."Product" USING btree ("tenantId");

CREATE INDEX "PushPreference_memberId_idx_76b3c263" ON public."PushPreference" USING btree ("memberId");

CREATE INDEX "PushPreference_tenantId_idx" ON public."PushPreference" USING btree ("tenantId");

CREATE UNIQUE INDEX "PushPreference_tenantId_memberId_event_key" ON public."PushPreference" USING btree ("tenantId", "memberId", event);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON public."PushSubscription" USING btree (endpoint);

CREATE INDEX "PushSubscription_memberId_idx_76b3c263" ON public."PushSubscription" USING btree ("memberId");

CREATE INDEX "PushSubscription_tenantId_idx" ON public."PushSubscription" USING btree ("tenantId");

CREATE INDEX "PushSubscription_tenantId_memberId_idx" ON public."PushSubscription" USING btree ("tenantId", "memberId");

CREATE INDEX "SeoMeta_tenantId_idx" ON public."SeoMeta" USING btree ("tenantId");

CREATE INDEX "Session_expiresAt_idx" ON public."Session" USING btree ("expiresAt");

CREATE INDEX "Session_memberId_idx" ON public."Session" USING btree ("memberId");

CREATE INDEX "StoreIntegration_tenantId_idx" ON public."StoreIntegration" USING btree ("tenantId");

CREATE INDEX "Subcategory_categoryId_idx" ON public."Subcategory" USING btree ("categoryId");

CREATE INDEX "Subcategory_tenantId_idx" ON public."Subcategory" USING btree ("tenantId");

CREATE INDEX "Tag_tenantId_idx" ON public."Tag" USING btree ("tenantId");

CREATE INDEX "TenantMembership_memberId_idx_76b3c263" ON public."TenantMembership" USING btree ("memberId");

CREATE UNIQUE INDEX "TenantMembership_memberId_tenantId_key" ON public."TenantMembership" USING btree ("memberId", "tenantId");

CREATE INDEX "TenantMembership_tenantId_idx" ON public."TenantMembership" USING btree ("tenantId");

CREATE UNIQUE INDEX "Tenant_slug_key" ON public."Tenant" USING btree (slug);

CREATE INDEX "Variation_productId_idx_5858600a" ON public."Variation" USING btree ("productId");

CREATE INDEX "Variation_tenantId_idx" ON public."Variation" USING btree ("tenantId");

CREATE INDEX "WalletTransaction_orderId_idx_d284871b" ON public."WalletTransaction" USING btree ("orderId");

CREATE INDEX "WalletTransaction_tenantId_idx" ON public."WalletTransaction" USING btree ("tenantId");

CREATE INDEX "WalletTransaction_walletId_idx" ON public."WalletTransaction" USING btree ("walletId");

CREATE INDEX "Wallet_customerId_idx_b2a8a46c" ON public."Wallet" USING btree ("customerId");

CREATE INDEX "Wallet_tenantId_idx" ON public."Wallet" USING btree ("tenantId");

CREATE TRIGGER "CategoryDepartment_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."CategoryDepartment" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();

CREATE TRIGGER "CouponProduct_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."CouponProduct" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();

CREATE TRIGGER "ProductBadge_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."ProductBadge" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();

CREATE TRIGGER "ProductTag_tenant_matches_parents" BEFORE INSERT OR UPDATE ON public."ProductTag" FOR EACH ROW EXECUTE FUNCTION public.menuza_join_tenant_guard();

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CategoryDepartment"
    ADD CONSTRAINT "CategoryDepartment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CategoryDepartment"
    ADD CONSTRAINT "CategoryDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public."Department"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CategoryDepartment"
    ADD CONSTRAINT "CategoryDepartment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponProduct"
    ADD CONSTRAINT "CouponProduct_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES public."Coupon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponProduct"
    ADD CONSTRAINT "CouponProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponProduct"
    ADD CONSTRAINT "CouponProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES public."Coupon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Coupon"
    ADD CONSTRAINT "Coupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Department"
    ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Domain"
    ADD CONSTRAINT "Domain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."GatewayEvent"
    ADD CONSTRAINT "GatewayEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."PaymentIntegration"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."GatewayEvent"
    ADD CONSTRAINT "GatewayEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."KitItem"
    ADD CONSTRAINT "KitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES public."Kit"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."KitItem"
    ADD CONSTRAINT "KitItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES public."Variation"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Kit"
    ADD CONSTRAINT "Kit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."McpSession"
    ADD CONSTRAINT "McpSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."MealSubscription"
    ADD CONSTRAINT "MealSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."MealSubscription"
    ADD CONSTRAINT "MealSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."MemberIdentity"
    ADD CONSTRAINT "MemberIdentity_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."MemberOnboarding"
    ADD CONSTRAINT "MemberOnboarding_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OAuthAuthCode"
    ADD CONSTRAINT "OAuthAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."OAuthClient"("clientId") ON DELETE CASCADE;

ALTER TABLE ONLY public."OAuthToken"
    ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."OAuthClient"("clientId") ON DELETE CASCADE;

ALTER TABLE ONLY public."OrderEvent"
    ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OrderEvent"
    ADD CONSTRAINT "OrderEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES public."Kit"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES public."Variation"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES public."Coupon"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PaymentIntegration"
    ADD CONSTRAINT "PaymentIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PaymentMethodAssignment"
    ADD CONSTRAINT "PaymentMethodAssignment_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."PaymentIntegration"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PaymentMethodAssignment"
    ADD CONSTRAINT "PaymentMethodAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductBadge"
    ADD CONSTRAINT "ProductBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES public."Badge"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductBadge"
    ADD CONSTRAINT "ProductBadge_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductBadge"
    ADD CONSTRAINT "ProductBadge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductNutrition"
    ADD CONSTRAINT "ProductNutrition_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductNutrition"
    ADD CONSTRAINT "ProductNutrition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductTag"
    ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductTag"
    ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tag"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProductTag"
    ADD CONSTRAINT "ProductTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES public."Subcategory"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PushPreference"
    ADD CONSTRAINT "PushPreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PushPreference"
    ADD CONSTRAINT "PushPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PushSubscription"
    ADD CONSTRAINT "PushSubscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PushSubscription"
    ADD CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SeoMeta"
    ADD CONSTRAINT "SeoMeta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."StoreIntegration"
    ADD CONSTRAINT "StoreIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."StoreSettings"
    ADD CONSTRAINT "StoreSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Subcategory"
    ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Subcategory"
    ADD CONSTRAINT "Subcategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES public."Member"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."TenantMembership"
    ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Variation"
    ADD CONSTRAINT "Variation_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Variation"
    ADD CONSTRAINT "Variation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."WalletTransaction"
    ADD CONSTRAINT "WalletTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."WalletTransaction"
    ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public."Wallet"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
