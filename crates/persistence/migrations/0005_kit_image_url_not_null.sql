-- `0003_kits.sql` backfilled every new `Kit` column except `imageUrl`, which the
-- panel DTO reads as a required string. A row created before the kit editor
-- existed therefore failed to decode with `UnexpectedNullError`.
--
-- Empty is the honest value for a kit nobody has given a photo yet: the editor
-- requires a non-empty URL on save, and the storefront already guards the card
-- with `kit.imageUrl ? ... : null`, so nothing renders a broken image.

UPDATE public."Kit" SET "imageUrl" = '' WHERE "imageUrl" IS NULL;

ALTER TABLE public."Kit" ALTER COLUMN "imageUrl" SET NOT NULL;
