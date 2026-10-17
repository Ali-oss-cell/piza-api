-- AlterEnum
ALTER TYPE "StockUnit" ADD VALUE IF NOT EXISTS 'BOX';
ALTER TYPE "StockUnit" ADD VALUE IF NOT EXISTS 'ROLL';

-- CreateEnum
CREATE TYPE "WeeklyStockOrderStatus" AS ENUM ('DRAFT', 'SENT');

-- AlterTable
ALTER TABLE "stock_items" ADD COLUMN "supplier_id" UUID,
ADD COLUMN "pack_size" TEXT,
ADD COLUMN "guide_qty" DECIMAL(12,3),
ADD COLUMN "sheet_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "weekly_stock_orders" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "week_commencing" DATE NOT NULL,
    "ordered_by" TEXT,
    "pizzas_expected" INTEGER,
    "supplier_day" TEXT,
    "status" "WeeklyStockOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_id" UUID,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_stock_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_stock_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "stock_item_id" UUID,
    "supplier_id" UUID,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "pack_size" TEXT,
    "guide_qty" DECIMAL(12,3),
    "sheet_order" INTEGER NOT NULL DEFAULT 0,
    "stock_on_hand" DECIMAL(12,3),
    "order_qty" DECIMAL(12,3),
    "received" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "weekly_stock_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_stock_order_dispatches" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "supplier_id" UUID,
    "supplier_name" TEXT NOT NULL,
    "emailed_to" TEXT NOT NULL,
    "item_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_stock_order_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_supplier_id_idx" ON "stock_items"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_stock_orders_brand_id_number_key" ON "weekly_stock_orders"("brand_id", "number");

-- CreateIndex
CREATE INDEX "weekly_stock_orders_brand_id_week_commencing_idx" ON "weekly_stock_orders"("brand_id", "week_commencing");

-- CreateIndex
CREATE INDEX "weekly_stock_order_lines_order_id_sheet_order_idx" ON "weekly_stock_order_lines"("order_id", "sheet_order");

-- CreateIndex
CREATE INDEX "weekly_stock_order_dispatches_order_id_idx" ON "weekly_stock_order_dispatches"("order_id");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_orders" ADD CONSTRAINT "weekly_stock_orders_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_order_lines" ADD CONSTRAINT "weekly_stock_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "weekly_stock_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_order_lines" ADD CONSTRAINT "weekly_stock_order_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_order_lines" ADD CONSTRAINT "weekly_stock_order_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_order_dispatches" ADD CONSTRAINT "weekly_stock_order_dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "weekly_stock_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_stock_order_dispatches" ADD CONSTRAINT "weekly_stock_order_dispatches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
