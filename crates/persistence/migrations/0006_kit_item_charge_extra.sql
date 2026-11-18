-- Kits: replace the kit-level exclusive sum mode with a per-dish `chargeExtra`
-- flag. The base price (`baseCents`) is charged for the kit, and dishes marked
-- with `chargeExtra = true` add their variation's price to the base.

ALTER TABLE public."KitItem" ADD COLUMN "chargeExtra" boolean DEFAULT false NOT NULL;

ALTER TABLE public."Kit" DROP CONSTRAINT IF EXISTS "Kit_pricingMode_check";

ALTER TABLE public."Kit" DROP COLUMN IF EXISTS "pricingMode";
