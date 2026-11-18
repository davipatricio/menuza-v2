-- A member who deletes their account closes the stores nobody else can open.
--
-- Those stores are archived, never deleted: their `Order` rows are the buyers'
-- receipts and the store's fiscal history, so the tenant must survive the member
-- who created it. An archived tenant resolves for nothing — no storefront host,
-- no panel slug, no membership in the store picker — and its slug stays taken so
-- a new store can never inherit the old store's receipt URLs.
ALTER TABLE public."Tenant" ADD COLUMN "archivedAt" timestamp(3) without time zone;
