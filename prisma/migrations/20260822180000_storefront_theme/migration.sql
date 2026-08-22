-- Per-store storefront theme: background colours, dark hero, dark-mode toggle
ALTER TABLE "brands" ADD COLUMN "background_light_color" TEXT;
ALTER TABLE "brands" ADD COLUMN "background_dark_color" TEXT;
ALTER TABLE "brands" ADD COLUMN "hero_image_dark_url" TEXT;
ALTER TABLE "brands" ADD COLUMN "dark_mode_enabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "brands" SET "background_light_color" = '#ffffff' WHERE "background_light_color" IS NULL;
UPDATE "brands" SET "background_dark_color" = '#000000' WHERE "background_dark_color" IS NULL;
