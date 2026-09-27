-- AlterEnum AuditAction
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_DISCOUNT'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_VOID_LINE'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_VOID_ORDER'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_REFUND'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_SHIFT_OPEN'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_SHIFT_CLOSE'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_TRAINING_TOGGLE'; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'POS_PIN_SET'; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PosDiscountType" AS ENUM ('PERCENT', 'AMOUNT', 'COMP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- User PIN
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pos_pin_hash" TEXT;

-- Location POS settings / printers
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "receipt_printer_host" TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "receipt_printer_port" INTEGER;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "kitchen_printer_host" TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "kitchen_printer_port" INTEGER;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "require_open_shift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "pos_training_mode" BOOLEAN NOT NULL DEFAULT false;

-- Menu SKU
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "sku" TEXT;
CREATE INDEX IF NOT EXISTS "menu_items_brand_id_sku_idx" ON "menu_items"("brand_id", "sku");

-- Orders extras
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "table_number" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pager_number" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shift_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_type" "PosDiscountType";
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_training" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "orders_shift_id_idx" ON "orders"("shift_id");
CREATE INDEX IF NOT EXISTS "orders_guest_phone_idx" ON "orders"("guest_phone");

-- PosShift
CREATE TABLE IF NOT EXISTS "pos_shifts" (
  "id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "register_id" TEXT,
  "opened_by_user_id" UUID NOT NULL,
  "closed_by_user_id" UUID,
  "opening_float" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "closing_counted_cash" DECIMAL(10,2),
  "expected_cash" DECIMAL(10,2),
  "card_total" DECIMAL(10,2),
  "cash_sales_total" DECIMAL(10,2),
  "discount_total" DECIMAL(10,2),
  "void_count" INTEGER,
  "refund_total" DECIMAL(10,2),
  "variance" DECIMAL(10,2),
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "report_snapshot" JSONB,
  CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pos_shifts_location_id_closed_at_idx" ON "pos_shifts"("location_id", "closed_at");

DO $$ BEGIN
  ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_opened_by_user_id_fkey"
    FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_closed_by_user_id_fkey"
    FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "pos_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Favourites
CREATE TABLE IF NOT EXISTS "pos_favourite_items" (
  "id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_favourite_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_favourite_items_location_id_menu_item_id_key"
  ON "pos_favourite_items"("location_id", "menu_item_id");
CREATE INDEX IF NOT EXISTS "pos_favourite_items_location_id_sort_order_idx"
  ON "pos_favourite_items"("location_id", "sort_order");

DO $$ BEGIN
  ALTER TABLE "pos_favourite_items" ADD CONSTRAINT "pos_favourite_items_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "pos_favourite_items" ADD CONSTRAINT "pos_favourite_items_menu_item_id_fkey"
    FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
