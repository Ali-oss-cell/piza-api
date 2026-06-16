-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEB', 'POS', 'PHONE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'REQUIRES_PAYMENT', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_TERMINAL', 'CARD_ONLINE', 'CASH', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN', 'COUNTER');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'STAFF';
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "staff_user_id" UUID,
ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'WEB',
ADD COLUMN "fulfillment_type" "FulfillmentType" NOT NULL DEFAULT 'PICKUP',
ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "payment_method" "PaymentMethod",
ADD COLUMN "stripe_payment_intent_id" TEXT,
ADD COLUMN "stripe_charge_id" TEXT,
ADD COLUMN "paid_at" TIMESTAMP(3),
ADD COLUMN "register_id" TEXT,
ADD COLUMN "ticket_number" INTEGER,
ADD COLUMN "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "promo_code" TEXT,
ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "removed_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "orders_staff_user_id_idx" ON "orders"("staff_user_id");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_channel_ticket_number_idx" ON "orders"("channel", "ticket_number");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
