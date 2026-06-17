ALTER TABLE "orders"
  ADD COLUMN "guest_phone" TEXT,
  ADD COLUMN "delivery_address_line1" TEXT,
  ADD COLUMN "delivery_address_line2" TEXT,
  ADD COLUMN "delivery_suburb" TEXT,
  ADD COLUMN "delivery_state" TEXT,
  ADD COLUMN "delivery_postcode" TEXT,
  ADD COLUMN "scheduled_at" TIMESTAMP(3);

UPDATE "store_settings"
SET "opening_hours" = '{
  "timezone": "Australia/Melbourne",
  "leadTimeMinutes": 45,
  "slotIntervalMinutes": 15,
  "days": {
    "monday": { "open": "17:00", "close": "22:00" },
    "tuesday": { "open": "17:00", "close": "22:00" },
    "wednesday": { "open": "17:00", "close": "22:00" },
    "thursday": { "open": "17:00", "close": "22:00" },
    "friday": { "open": "12:00", "close": "23:00" },
    "saturday": { "open": "12:00", "close": "23:00" },
    "sunday": { "open": "12:00", "close": "23:00" }
  }
}'::jsonb
WHERE "id" = '00000000-0000-0000-0000-000000000001'::uuid;
