-- AlterTable
ALTER TABLE "store_payment_settings" ADD COLUMN IF NOT EXISTS "linkly_pair_secret_enc" TEXT;
ALTER TABLE "store_payment_settings" ADD COLUMN IF NOT EXISTS "linkly_pos_id" TEXT;
