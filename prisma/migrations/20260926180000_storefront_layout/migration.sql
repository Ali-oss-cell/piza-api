-- CreateEnum
CREATE TYPE "StorefrontLayout" AS ENUM ('CLASSIC', 'MENU_FIRST', 'MAGAZINE');

-- AlterTable
ALTER TABLE "brands" ADD COLUMN "storefront_layout" "StorefrontLayout" NOT NULL DEFAULT 'CLASSIC';
