-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "supports_size_options" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "menu_categories" ("id", "slug", "label", "sort_order", "supports_size_options", "is_active", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'traditional-pizza', 'Traditional Pizza', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'gourmet-pizza', 'Gourmet Pizza', 1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'pastas', 'Pastas', 2, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'sides', 'Sides', 3, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'drinks', 'Drinks', 4, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'desserts', 'Desserts', 5, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX "menu_categories_slug_key" ON "menu_categories"("slug");

ALTER TABLE "menu_items" ADD COLUMN "category_slug" TEXT;

UPDATE "menu_items"
SET "category_slug" = CASE "category"::text
    WHEN 'TRADITIONAL_PIZZA' THEN 'traditional-pizza'
    WHEN 'GOURMET_PIZZA' THEN 'gourmet-pizza'
    WHEN 'PASTAS' THEN 'pastas'
    WHEN 'SIDES' THEN 'sides'
    WHEN 'DRINKS' THEN 'drinks'
    WHEN 'DESSERTS' THEN 'desserts'
    ELSE 'traditional-pizza'
END;

ALTER TABLE "menu_items" ALTER COLUMN "category_slug" SET NOT NULL;
ALTER TABLE "menu_items" DROP COLUMN "category";
DROP TYPE "MenuCategory";

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_slug_fkey"
    FOREIGN KEY ("category_slug") REFERENCES "menu_categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "menu_items_category_slug_idx" ON "menu_items"("category_slug");

-- CreateTable
CREATE TABLE "crust_options" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_delta" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crust_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crust_options_slug_key" ON "crust_options"("slug");

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    "store_name" TEXT NOT NULL,
    "tagline" TEXT,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "min_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "opening_hours" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "store_settings" ("id", "store_name", "tagline", "delivery_fee", "min_order_amount", "contact_email", "contact_phone", "address", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Leovorno',
    'Premium Italian pizza, crafted for the urban epicurean.',
    5,
    0,
    'hello@leovorno.com',
    '+61 2 9000 0000',
    '123 Collins Street, Melbourne VIC 3000',
    CURRENT_TIMESTAMP
);
