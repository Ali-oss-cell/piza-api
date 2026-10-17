-- AlterEnum
DO $$ BEGIN ALTER TYPE "AuditAction" ADD VALUE 'EMAIL_SETTINGS_UPDATED'; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE "store_email_settings" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password_enc" TEXT,
    "from_name" TEXT,
    "from_email" TEXT,
    "reply_to" TEXT,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_email_settings_store_id_key" ON "store_email_settings"("store_id");

-- AddForeignKey
ALTER TABLE "store_email_settings" ADD CONSTRAINT "store_email_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
