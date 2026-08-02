-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'SALE';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(10,2);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "order_id" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "menu_item_recipe_lines" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_per_unit" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menu_item_recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_recipe_lines_menu_item_id_stock_item_id_key" ON "menu_item_recipe_lines"("menu_item_id", "stock_item_id");
CREATE INDEX IF NOT EXISTS "menu_item_recipe_lines_brand_id_menu_item_id_idx" ON "menu_item_recipe_lines"("brand_id", "menu_item_id");
CREATE INDEX IF NOT EXISTS "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "menu_item_recipe_lines" ADD CONSTRAINT "menu_item_recipe_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
