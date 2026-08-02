-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVENTORY_OVERRIDE';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'REFUND';

DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Menu item recipe size key
ALTER TABLE "menu_item_recipe_lines" ADD COLUMN IF NOT EXISTS "size_key" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "menu_item_recipe_lines_menu_item_id_stock_item_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_recipe_lines_menu_item_id_stock_item_id_size_key_key"
  ON "menu_item_recipe_lines"("menu_item_id", "stock_item_id", "size_key");

-- Stock movement PO link
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "purchase_order_id" UUID;
CREATE INDEX IF NOT EXISTS "stock_movements_purchase_order_id_idx" ON "stock_movements"("purchase_order_id");

-- Topping / crust recipe lines
CREATE TABLE IF NOT EXISTS "extra_topping_recipe_lines" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "topping_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_per_unit" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extra_topping_recipe_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crust_option_recipe_lines" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "crust_option_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_per_unit" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crust_option_recipe_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extra_topping_recipe_lines_topping_id_stock_item_id_key"
  ON "extra_topping_recipe_lines"("topping_id", "stock_item_id");
CREATE INDEX IF NOT EXISTS "extra_topping_recipe_lines_brand_id_topping_id_idx"
  ON "extra_topping_recipe_lines"("brand_id", "topping_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crust_option_recipe_lines_crust_option_id_stock_item_id_key"
  ON "crust_option_recipe_lines"("crust_option_id", "stock_item_id");
CREATE INDEX IF NOT EXISTS "crust_option_recipe_lines_brand_id_crust_option_id_idx"
  ON "crust_option_recipe_lines"("brand_id", "crust_option_id");

-- Suppliers + POs
CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "abn" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_ordered" DECIMAL(12,3) NOT NULL,
    "qty_received" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_brand_id_name_key" ON "suppliers"("brand_id", "name");
CREATE INDEX IF NOT EXISTS "suppliers_brand_id_is_active_idx" ON "suppliers"("brand_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_brand_id_number_key" ON "purchase_orders"("brand_id", "number");
CREATE INDEX IF NOT EXISTS "purchase_orders_brand_id_status_idx" ON "purchase_orders"("brand_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_lines_purchase_order_id_stock_item_id_key"
  ON "purchase_order_lines"("purchase_order_id", "stock_item_id");

DO $$ BEGIN
  ALTER TABLE "extra_topping_recipe_lines" ADD CONSTRAINT "extra_topping_recipe_lines_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "extra_topping_recipe_lines" ADD CONSTRAINT "extra_topping_recipe_lines_topping_id_fkey" FOREIGN KEY ("topping_id") REFERENCES "extra_toppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "extra_topping_recipe_lines" ADD CONSTRAINT "extra_topping_recipe_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "crust_option_recipe_lines" ADD CONSTRAINT "crust_option_recipe_lines_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crust_option_recipe_lines" ADD CONSTRAINT "crust_option_recipe_lines_crust_option_id_fkey" FOREIGN KEY ("crust_option_id") REFERENCES "crust_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crust_option_recipe_lines" ADD CONSTRAINT "crust_option_recipe_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
