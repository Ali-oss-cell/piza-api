-- CreateEnum
CREATE TYPE "MenuItemBadge" AS ENUM ('SIGNATURE', 'SPICY', 'VEGAN');

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "badges" "MenuItemBadge"[] DEFAULT ARRAY[]::"MenuItemBadge"[];

UPDATE "menu_items"
SET "badges" = ARRAY['SIGNATURE']::"MenuItemBadge"[]
WHERE "signature" = true;

ALTER TABLE "menu_items" DROP COLUMN "signature";
