-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('DRAFT', 'LIVE');

-- CreateEnum
CREATE TYPE "StorePaymentProvider" AS ENUM ('NONE', 'CASH', 'STRIPE', 'LINKLY');

-- CreateEnum
CREATE TYPE "StoreMembershipRole" AS ENUM ('PLATFORM_ADMIN', 'STORE_ADMIN', 'STAFF');

-- AlterTable
ALTER TABLE "brands" ADD COLUMN "status" "BrandStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill existing brands as live
UPDATE "brands" SET "status" = 'LIVE';

-- CreateTable
CREATE TABLE "store_domains" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "location_id" UUID,
    "host" TEXT,
    "path_prefix" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_payment_settings" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "provider" "StorePaymentProvider" NOT NULL DEFAULT 'CASH',
    "cash_enabled" BOOLEAN NOT NULL DEFAULT true,
    "card_terminal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "card_online_enabled" BOOLEAN NOT NULL DEFAULT false,
    "stripe_publishable_key" TEXT,
    "stripe_secret_key_ref" TEXT,
    "stripe_webhook_secret_ref" TEXT,
    "linkly_username" TEXT,
    "linkly_secret_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stores" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "role" "StoreMembershipRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_host_key" ON "store_domains"("host");

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_path_prefix_key" ON "store_domains"("path_prefix");

-- CreateIndex
CREATE INDEX "store_domains_store_id_idx" ON "store_domains"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_payment_settings_store_id_key" ON "store_payment_settings"("store_id");

-- CreateIndex
CREATE INDEX "user_stores_store_id_idx" ON "user_stores"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_stores_user_id_store_id_key" ON "user_stores"("user_id", "store_id");

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_payment_settings" ADD CONSTRAINT "store_payment_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
