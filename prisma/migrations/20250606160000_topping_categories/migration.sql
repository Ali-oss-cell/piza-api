-- CreateTable
CREATE TABLE "topping_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topping_categories_pkey" PRIMARY KEY ("id")
);

-- Seed categories from existing toppings
INSERT INTO "topping_categories" ("id", "slug", "label", "sort_order", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    category_slug,
    MAX(category_label),
    ROW_NUMBER() OVER (ORDER BY MIN(category_slug)) - 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "extra_toppings"
GROUP BY category_slug;

-- CreateIndex
CREATE UNIQUE INDEX "topping_categories_slug_key" ON "topping_categories"("slug");

-- AddForeignKey
ALTER TABLE "extra_toppings" ADD CONSTRAINT "extra_toppings_category_slug_fkey" FOREIGN KEY ("category_slug") REFERENCES "topping_categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
