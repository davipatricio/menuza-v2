-- `Kit.mode` carried the two-mode model (`preselected`, `build_your_own`) that
-- `0003_kits.sql` replaced with `kind` (`fixed`, `custom_quantities`,
-- `fixed_total`). Nothing reads it anymore: the panel, the storefront and the
-- checkout all go through `kind`, and the backfill in `0003` copied every row.
--
-- Dropped rather than kept as an alias so a future writer cannot reintroduce a
-- second source of truth for the kit shape.

ALTER TABLE public."Kit" DROP CONSTRAINT IF EXISTS "Kit_mode_check_9edd585a";

ALTER TABLE public."Kit" DROP COLUMN "mode";
