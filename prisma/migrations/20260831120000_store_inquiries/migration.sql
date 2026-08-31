-- CreateEnum
CREATE TYPE "InquiryType" AS ENUM ('CONTACT', 'CAREERS', 'CATERING');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "store_inquiries" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "type" "InquiryType" NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "store_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_inquiries_brand_id_status_created_at_idx" ON "store_inquiries"("brand_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "store_inquiries_brand_id_type_idx" ON "store_inquiries"("brand_id", "type");

-- AddForeignKey
ALTER TABLE "store_inquiries" ADD CONSTRAINT "store_inquiries_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
