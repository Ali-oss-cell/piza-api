-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CRM_EXPORT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CRM_CUSTOMER_UPDATED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "store_customer_id" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "store_customers" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "identity_key" TEXT NOT NULL,
    "phone" TEXT,
    "phone_normalized" TEXT,
    "email" TEXT,
    "email_normalized" TEXT,
    "name" TEXT,
    "notes" TEXT,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "first_order_at" TIMESTAMP(3),
    "marketing_email_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "marketing_sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "consent_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "customer_tags" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT DEFAULT '#d81b60',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "store_customer_tags" (
    "customer_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_customer_tags_pkey" PRIMARY KEY ("customer_id","tag_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "customer_segments" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "store_customers_brand_id_identity_key_key" ON "store_customers"("brand_id", "identity_key");
CREATE INDEX IF NOT EXISTS "store_customers_brand_id_last_order_at_idx" ON "store_customers"("brand_id", "last_order_at");
CREATE INDEX IF NOT EXISTS "store_customers_brand_id_name_idx" ON "store_customers"("brand_id", "name");
CREATE INDEX IF NOT EXISTS "store_customers_brand_id_phone_normalized_idx" ON "store_customers"("brand_id", "phone_normalized");
CREATE INDEX IF NOT EXISTS "store_customers_brand_id_email_normalized_idx" ON "store_customers"("brand_id", "email_normalized");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_tags_brand_id_slug_key" ON "customer_tags"("brand_id", "slug");
CREATE INDEX IF NOT EXISTS "customer_segments_brand_id_idx" ON "customer_segments"("brand_id");
CREATE INDEX IF NOT EXISTS "orders_store_customer_id_idx" ON "orders"("store_customer_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "store_customers" ADD CONSTRAINT "store_customers_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "store_customer_tags" ADD CONSTRAINT "store_customer_tags_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "store_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "store_customer_tags" ADD CONSTRAINT "store_customer_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "customer_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_store_customer_id_fkey" FOREIGN KEY ("store_customer_id") REFERENCES "store_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
