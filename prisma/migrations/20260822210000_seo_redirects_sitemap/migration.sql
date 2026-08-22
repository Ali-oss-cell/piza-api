-- AlterTable
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "sitemap_submitted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seo_redirects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_redirects_store_id_from_path_key" ON "seo_redirects"("store_id", "from_path");
CREATE INDEX IF NOT EXISTS "seo_redirects_store_id_is_active_idx" ON "seo_redirects"("store_id", "is_active");

DO $$ BEGIN
  ALTER TABLE "seo_redirects" ADD CONSTRAINT "seo_redirects_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
