-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StockUnit" AS ENUM ('EACH', 'KG', 'G', 'L', 'ML', 'CARTON', 'PACK', 'BAG');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'ADJUST', 'WASTE', 'COUNT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_items" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "unit" "StockUnit" NOT NULL DEFAULT 'EACH',
    "qty_on_hand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "low_stock_at" DECIMAL(12,3),
    "cost_per_unit" DECIMAL(10,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "delta_qty" DECIMAL(12,3) NOT NULL,
    "qty_after" DECIMAL(12,3) NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_brand_id_name_key" ON "stock_items"("brand_id", "name");
CREATE INDEX IF NOT EXISTS "stock_items_brand_id_is_active_idx" ON "stock_items"("brand_id", "is_active");
CREATE INDEX IF NOT EXISTS "stock_movements_brand_id_created_at_idx" ON "stock_movements"("brand_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_movements_stock_item_id_created_at_idx" ON "stock_movements"("stock_item_id", "created_at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
