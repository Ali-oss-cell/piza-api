-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'STAFF', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MenuItemBadge" AS ENUM ('SIGNATURE', 'SPICY', 'VEGAN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEB', 'POS', 'PHONE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'REQUIRES_PAYMENT', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_TERMINAL', 'CARD_ONLINE', 'CASH', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN', 'COUNTER');

-- CreateEnum
CREATE TYPE "DealDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "supports_size_options" BOOLEAN NOT NULL DEFAULT false,
    "supports_extras" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "category_slug" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_alt" TEXT NOT NULL,
    "badges" "MenuItemBadge"[] DEFAULT ARRAY[]::"MenuItemBadge"[],
    "price_note" TEXT,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "size_options" JSONB,
    "size_pricing" JSONB,
    "allowed_topping_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topping_categories" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topping_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_toppings" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "crust_options" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_delta" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crust_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
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

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "badge_label" TEXT,
    "discount_type" "DealDiscountType" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "promo_code" TEXT,
    "image_url" TEXT,
    "image_alt" TEXT,
    "terms_note" TEXT,
    "cta_label" TEXT NOT NULL DEFAULT 'Order Now',
    "cta_href" TEXT NOT NULL DEFAULT '/',
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "user_id" UUID,
    "staff_user_id" UUID,
    "guest_email" TEXT,
    "guest_name" TEXT,
    "guest_phone" TEXT,
    "delivery_address_line1" TEXT,
    "delivery_address_line2" TEXT,
    "delivery_suburb" TEXT,
    "delivery_state" TEXT,
    "delivery_postcode" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "channel" "OrderChannel" NOT NULL DEFAULT 'WEB',
    "delivery_mode" "DeliveryMode" NOT NULL,
    "fulfillment_type" "FulfillmentType" NOT NULL DEFAULT 'PICKUP',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method" "PaymentMethod",
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "register_id" TEXT,
    "ticket_number" INTEGER,
    "client_request_id" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "promo_code" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "size" TEXT,
    "crust" TEXT,
    "toppings" JSONB,
    "removed_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "locations_brand_id_slug_key" ON "locations"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_brand_id_slug_key" ON "menu_categories"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "menu_items_brand_id_category_slug_idx" ON "menu_items"("brand_id", "category_slug");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_brand_id_slug_key" ON "menu_items"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "topping_categories_brand_id_slug_key" ON "topping_categories"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "extra_toppings_brand_id_category_slug_sort_order_idx" ON "extra_toppings"("brand_id", "category_slug", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "extra_toppings_brand_id_slug_key" ON "extra_toppings"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "crust_options_brand_id_slug_key" ON "crust_options"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_brand_id_slug_key" ON "ingredient_categories"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "ingredients_brand_id_category_slug_sort_order_idx" ON "ingredients"("brand_id", "category_slug", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_brand_id_slug_key" ON "ingredients"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "deals_brand_id_slug_key" ON "deals"("brand_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "deals_brand_id_promo_code_key" ON "deals"("brand_id", "promo_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_client_request_id_key" ON "orders"("client_request_id");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_staff_user_id_idx" ON "orders"("staff_user_id");

-- CreateIndex
CREATE INDEX "orders_location_id_idx" ON "orders"("location_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_channel_ticket_number_idx" ON "orders"("channel", "ticket_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_id_category_slug_fkey" FOREIGN KEY ("brand_id", "category_slug") REFERENCES "menu_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topping_categories" ADD CONSTRAINT "topping_categories_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_toppings" ADD CONSTRAINT "extra_toppings_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_toppings" ADD CONSTRAINT "extra_toppings_brand_id_category_slug_fkey" FOREIGN KEY ("brand_id", "category_slug") REFERENCES "topping_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crust_options" ADD CONSTRAINT "crust_options_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_categories" ADD CONSTRAINT "ingredient_categories_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brand_id_category_slug_fkey" FOREIGN KEY ("brand_id", "category_slug") REFERENCES "ingredient_categories"("brand_id", "slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

