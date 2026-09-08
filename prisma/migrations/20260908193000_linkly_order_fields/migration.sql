-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "linkly_session_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "linkly_rfn" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "linkly_txn_ref" TEXT;
