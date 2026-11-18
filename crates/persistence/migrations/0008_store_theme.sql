-- Store appearance (MEN-313): the palette the buyer-facing storefront and the
-- native app paint. Nullable on purpose: no value means "the platform default",
-- never a blank color, and the API resolves the default before answering.
ALTER TABLE public."StoreSettings"
    ADD COLUMN "primaryColor" text,
    ADD COLUMN "accentColor" text,
    ADD COLUMN "backgroundColor" text,
    ADD COLUMN radius integer;

ALTER TABLE public."StoreSettings"
    ADD CONSTRAINT store_settings_radius_check
        CHECK (radius IS NULL OR (radius >= 0 AND radius <= 32));
