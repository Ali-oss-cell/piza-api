-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN "supports_extras" BOOLEAN NOT NULL DEFAULT false;

UPDATE "menu_categories"
SET "supports_extras" = true
WHERE "slug" IN ('traditional-pizza', 'gourmet-pizza', 'pastas', 'sides', 'desserts');
