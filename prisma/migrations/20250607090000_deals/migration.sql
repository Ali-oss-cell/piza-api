-- CreateEnum
CREATE TYPE "DealDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "badge_label" TEXT,
    "discount_type" "DealDiscountType" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "promo_code" TEXT,
    "image_url" TEXT,
    "image_alt" TEXT,
    "terms_note" TEXT,
    "cta_label" TEXT NOT NULL DEFAULT 'Order Now',
    "cta_href" TEXT NOT NULL DEFAULT '/',
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_slug_key" ON "deals"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "deals_promo_code_key" ON "deals"("promo_code");
