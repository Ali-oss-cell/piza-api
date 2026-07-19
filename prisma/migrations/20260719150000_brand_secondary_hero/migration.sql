-- AlterTable
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "secondary_color" TEXT;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "hero_image_url" TEXT;
