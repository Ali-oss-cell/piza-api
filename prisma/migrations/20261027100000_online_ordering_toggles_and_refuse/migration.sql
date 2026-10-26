-- AlterTable: Location online ordering controls
ALTER TABLE "locations" ADD COLUMN "online_ordering_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Order refuse tracking
ALTER TABLE "orders" ADD COLUMN "refused_by_user_id" UUID;
ALTER TABLE "orders" ADD COLUMN "refused_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "refuse_reason" TEXT;

-- CreateIndex
CREATE INDEX "orders_refused_by_user_id_idx" ON "orders"("refused_by_user_id");
CREATE INDEX "orders_refused_at_idx" ON "orders"("refused_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_refused_by_user_id_fkey" FOREIGN KEY ("refused_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
