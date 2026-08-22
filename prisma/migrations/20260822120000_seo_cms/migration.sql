-- AlterEnum
ALTER TYPE "StoreMembershipRole" ADD VALUE 'SEO';

-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "seo_content" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "domain_id" UUID,
    "page" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "meta_title" TEXT,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "og_image_url" TEXT,
    "robots_index" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_images" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "domain_id" UUID,
    "filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "label" TEXT,
    "page" TEXT,
    "section" TEXT,
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "domain_id" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "thumbnail_image_id" UUID,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seo_content_store_id_domain_id_page_idx" ON "seo_content"("store_id", "domain_id", "page");

-- CreateIndex
CREATE INDEX "seo_images_store_id_domain_id_idx" ON "seo_images"("store_id", "domain_id");

-- CreateIndex
CREATE INDEX "blog_posts_store_id_domain_id_status_idx" ON "blog_posts"("store_id", "domain_id", "status");

-- Partial unique indexes (NULL domain_id = store default)
CREATE UNIQUE INDEX "seo_content_store_default_unique" ON "seo_content"("store_id", "page", "section") WHERE "domain_id" IS NULL;
CREATE UNIQUE INDEX "seo_content_domain_unique" ON "seo_content"("store_id", "domain_id", "page", "section") WHERE "domain_id" IS NOT NULL;
CREATE UNIQUE INDEX "blog_posts_store_default_slug_unique" ON "blog_posts"("store_id", "slug") WHERE "domain_id" IS NULL;
CREATE UNIQUE INDEX "blog_posts_domain_slug_unique" ON "blog_posts"("store_id", "domain_id", "slug") WHERE "domain_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "seo_content" ADD CONSTRAINT "seo_content_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_content" ADD CONSTRAINT "seo_content_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "store_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_images" ADD CONSTRAINT "seo_images_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_images" ADD CONSTRAINT "seo_images_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "store_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "store_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_thumbnail_image_id_fkey" FOREIGN KEY ("thumbnail_image_id") REFERENCES "seo_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
