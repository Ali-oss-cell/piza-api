-- CreateEnum
CREATE TYPE "DealScope" AS ENUM ('STORE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
    'STORE_CREATED',
    'STORE_SUSPENDED',
    'STORE_ACTIVATED',
    'PAYMENT_SETTINGS_UPDATED',
    'DOMAIN_CREATED',
    'DOMAIN_UPDATED',
    'MEMBERSHIP_INVITED',
    'MEMBERSHIP_UPDATED',
    'MEMBERSHIP_DEACTIVATED',
    'MENU_TEMPLATE_APPLIED',
    'DEAL_PUSHED',
    'LOCATION_CREATED',
    'LOCATION_UPDATED'
);

-- AlterTable
ALTER TABLE "deals" ADD COLUMN "scope" "DealScope" NOT NULL DEFAULT 'STORE';

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "is_franchise_locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_stores" ADD COLUMN "location_id" UUID;

-- CreateIndex
CREATE INDEX "user_stores_location_id_idx" ON "user_stores"("location_id");

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "store_id" UUID,
    "action" "AuditAction" NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_store_id_created_at_idx" ON "audit_events"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "menu_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_brand_id" UUID,
    "snapshot" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_templates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "menu_templates" ADD CONSTRAINT "menu_templates_source_brand_id_fkey" FOREIGN KEY ("source_brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
