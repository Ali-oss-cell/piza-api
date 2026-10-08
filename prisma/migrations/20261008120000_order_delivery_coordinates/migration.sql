ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_latitude" DECIMAL(9,6);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_longitude" DECIMAL(9,6);
