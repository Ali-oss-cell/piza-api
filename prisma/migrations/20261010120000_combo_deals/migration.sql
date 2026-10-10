-- CreateEnum
CREATE TYPE "ComboSlotSourceType" AS ENUM ('CATEGORY', 'ITEM');

-- CreateTable
CREATE TABLE "combo_deals" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT,
    "image_alt" TEXT,
    "bundle_price" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_deal_slots" (
    "id" UUID NOT NULL,
    "combo_deal_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source_type" "ComboSlotSourceType" NOT NULL,
    "category_slug" TEXT,
    "menu_item_id" UUID,
    "allowed_sizes" JSONB,
    "allow_modifiers" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_deal_slots_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "combo_deal_id" UUID,
ADD COLUMN "combo_instance_id" UUID,
ADD COLUMN "is_combo_header" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "combo_deals_brand_id_is_active_sort_order_idx" ON "combo_deals"("brand_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "combo_deals_brand_id_slug_key" ON "combo_deals"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "combo_deal_slots_combo_deal_id_sort_order_idx" ON "combo_deal_slots"("combo_deal_id", "sort_order");

-- CreateIndex
CREATE INDEX "order_items_combo_instance_id_idx" ON "order_items"("combo_instance_id");

-- AddForeignKey
ALTER TABLE "combo_deals" ADD CONSTRAINT "combo_deals_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_deal_slots" ADD CONSTRAINT "combo_deal_slots_combo_deal_id_fkey" FOREIGN KEY ("combo_deal_id") REFERENCES "combo_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_deal_slots" ADD CONSTRAINT "combo_deal_slots_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
