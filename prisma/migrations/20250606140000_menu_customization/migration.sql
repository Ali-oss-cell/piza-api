-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "menu_items" ADD COLUMN "size_options" JSONB;
ALTER TABLE "menu_items" ADD COLUMN "allowed_topping_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "menu_items"
SET "size_options" = jsonb_build_object(
  'small', jsonb_build_object('enabled', true, 'price', COALESCE(("size_pricing"->>'small')::numeric, "price")),
  'large', jsonb_build_object('enabled', true, 'price', COALESCE(("size_pricing"->>'large')::numeric, "price")),
  'family', jsonb_build_object('enabled', true, 'price', COALESCE(("size_pricing"->>'family')::numeric, "price"))
)
WHERE "size_pricing" IS NOT NULL;

CREATE TABLE "extra_toppings" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "price_delta" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extra_toppings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "extra_toppings_slug_key" ON "extra_toppings"("slug");
CREATE INDEX "extra_toppings_category_slug_sort_order_idx" ON "extra_toppings"("category_slug", "sort_order");
