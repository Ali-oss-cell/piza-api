-- Multi-brand: Brand, Location, brand-scoped catalog, orders linked to location

CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suburb" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "min_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "opening_hours" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "stripe_terminal_location_id" TEXT,
    "stripe_terminal_reader_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locations_brand_id_slug_key" ON "locations"("brand_id", "slug");

ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed brands (fixed IDs for migration backfill)
INSERT INTO "brands" ("id", "slug", "name", "tagline", "primary_color", "is_active", "updated_at")
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'leovorno', 'Leovorno', 'Pizza & Pasta Refined', '#D81B60', true, CURRENT_TIMESTAMP),
    ('a0000000-0000-0000-0000-000000000002', 'bunny-boys', 'Bunny Boys', 'Burgers, wings & good times', '#FF6B35', true, CURRENT_TIMESTAMP);

-- Seed default locations (copy Leovorno settings from store_settings)
INSERT INTO "locations" (
    "id", "brand_id", "slug", "name", "suburb", "address", "phone", "email",
    "delivery_fee", "min_order_amount", "opening_hours", "is_active", "is_default", "updated_at"
)
SELECT
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'murrumbeena',
    'Murrumbeena',
    'Murrumbeena',
    ss."address",
    ss."contact_phone",
    ss."contact_email",
    ss."delivery_fee",
    ss."min_order_amount",
    ss."opening_hours",
    true,
    true,
    CURRENT_TIMESTAMP
FROM "store_settings" ss
WHERE ss."id" = '00000000-0000-0000-0000-000000000001';

INSERT INTO "locations" (
    "id", "brand_id", "slug", "name", "suburb", "address", "phone", "email",
    "delivery_fee", "min_order_amount", "opening_hours", "is_active", "is_default", "updated_at"
)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'main',
    'Bunny Boys',
    NULL,
    NULL,
    NULL,
    NULL,
    5,
    0,
    NULL,
    true,
    true,
    CURRENT_TIMESTAMP
);

-- menu_categories: add brand_id, backfill, swap unique constraint
ALTER TABLE "menu_categories" ADD COLUMN "brand_id" UUID;

UPDATE "menu_categories" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';

ALTER TABLE "menu_categories" ALTER COLUMN "brand_id" SET NOT NULL;

ALTER TABLE "menu_categories" DROP CONSTRAINT IF EXISTS "menu_categories_slug_key";
DROP INDEX IF EXISTS "menu_categories_slug_key";

CREATE UNIQUE INDEX "menu_categories_brand_id_slug_key" ON "menu_categories"("brand_id", "slug");

ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- menu_items: add brand_id, fix category FK
ALTER TABLE "menu_items" ADD COLUMN "brand_id" UUID;

UPDATE "menu_items" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';

ALTER TABLE "menu_items" ALTER COLUMN "brand_id" SET NOT NULL;

ALTER TABLE "menu_items" DROP CONSTRAINT IF EXISTS "menu_items_category_slug_fkey";

ALTER TABLE "menu_items" DROP CONSTRAINT IF EXISTS "menu_items_slug_key";
DROP INDEX IF EXISTS "menu_items_slug_key";

CREATE UNIQUE INDEX "menu_items_brand_id_slug_key" ON "menu_items"("brand_id", "slug");
CREATE INDEX "menu_items_brand_id_category_slug_idx" ON "menu_items"("brand_id", "category_slug");

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_id_category_slug_fkey"
    FOREIGN KEY ("brand_id", "category_slug") REFERENCES "menu_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- topping_categories
ALTER TABLE "topping_categories" ADD COLUMN "brand_id" UUID;
UPDATE "topping_categories" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "topping_categories" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "topping_categories" DROP CONSTRAINT IF EXISTS "topping_categories_slug_key";
DROP INDEX IF EXISTS "topping_categories_slug_key";
CREATE UNIQUE INDEX "topping_categories_brand_id_slug_key" ON "topping_categories"("brand_id", "slug");
ALTER TABLE "topping_categories" ADD CONSTRAINT "topping_categories_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- extra_toppings
ALTER TABLE "extra_toppings" ADD COLUMN "brand_id" UUID;
UPDATE "extra_toppings" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "extra_toppings" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "extra_toppings" DROP CONSTRAINT IF EXISTS "extra_toppings_category_slug_fkey";
ALTER TABLE "extra_toppings" DROP CONSTRAINT IF EXISTS "extra_toppings_slug_key";
DROP INDEX IF EXISTS "extra_toppings_slug_key";
CREATE UNIQUE INDEX "extra_toppings_brand_id_slug_key" ON "extra_toppings"("brand_id", "slug");
CREATE INDEX "extra_toppings_brand_id_category_slug_sort_order_idx" ON "extra_toppings"("brand_id", "category_slug", "sort_order");
ALTER TABLE "extra_toppings" ADD CONSTRAINT "extra_toppings_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extra_toppings" ADD CONSTRAINT "extra_toppings_brand_id_category_slug_fkey"
    FOREIGN KEY ("brand_id", "category_slug") REFERENCES "topping_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- crust_options
ALTER TABLE "crust_options" ADD COLUMN "brand_id" UUID;
UPDATE "crust_options" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "crust_options" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "crust_options" DROP CONSTRAINT IF EXISTS "crust_options_slug_key";
DROP INDEX IF EXISTS "crust_options_slug_key";
CREATE UNIQUE INDEX "crust_options_brand_id_slug_key" ON "crust_options"("brand_id", "slug");
ALTER TABLE "crust_options" ADD CONSTRAINT "crust_options_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ingredient_categories
ALTER TABLE "ingredient_categories" ADD COLUMN "brand_id" UUID;
UPDATE "ingredient_categories" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "ingredient_categories" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "ingredient_categories" DROP CONSTRAINT IF EXISTS "ingredient_categories_slug_key";
DROP INDEX IF EXISTS "ingredient_categories_slug_key";
CREATE UNIQUE INDEX "ingredient_categories_brand_id_slug_key" ON "ingredient_categories"("brand_id", "slug");
ALTER TABLE "ingredient_categories" ADD CONSTRAINT "ingredient_categories_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ingredients
ALTER TABLE "ingredients" ADD COLUMN "brand_id" UUID;
UPDATE "ingredients" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "ingredients" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_category_slug_fkey";
ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_slug_key";
DROP INDEX IF EXISTS "ingredients_slug_key";
CREATE UNIQUE INDEX "ingredients_brand_id_slug_key" ON "ingredients"("brand_id", "slug");
CREATE INDEX "ingredients_brand_id_category_slug_sort_order_idx" ON "ingredients"("brand_id", "category_slug", "sort_order");
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brand_id_category_slug_fkey"
    FOREIGN KEY ("brand_id", "category_slug") REFERENCES "ingredient_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- deals
ALTER TABLE "deals" ADD COLUMN "brand_id" UUID;
UPDATE "deals" SET "brand_id" = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE "deals" ALTER COLUMN "brand_id" SET NOT NULL;
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_slug_key";
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_promo_code_key";
DROP INDEX IF EXISTS "deals_slug_key";
DROP INDEX IF EXISTS "deals_promo_code_key";
CREATE UNIQUE INDEX "deals_brand_id_slug_key" ON "deals"("brand_id", "slug");
CREATE UNIQUE INDEX "deals_brand_id_promo_code_key" ON "deals"("brand_id", "promo_code");
ALTER TABLE "deals" ADD CONSTRAINT "deals_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- orders: location_id
ALTER TABLE "orders" ADD COLUMN "location_id" UUID;

UPDATE "orders" SET "location_id" = 'b0000000-0000-0000-0000-000000000001';

ALTER TABLE "orders" ALTER COLUMN "location_id" SET NOT NULL;

CREATE INDEX "orders_location_id_idx" ON "orders"("location_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bunny Boys starter menu categories (empty catalog for admin to fill)
INSERT INTO "menu_categories" ("id", "brand_id", "slug", "label", "sort_order", "supports_size_options", "supports_extras", "is_active", "updated_at")
VALUES
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'burgers', 'Burgers', 0, false, true, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'sides', 'Sides', 1, false, false, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'drinks', 'Drinks', 2, false, false, true, CURRENT_TIMESTAMP);
