-- Per-location Linkly pinpad override (brand StorePaymentSettings remains fallback).
CREATE TABLE "location_payment_settings" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "provider" "StorePaymentProvider" NOT NULL DEFAULT 'LINKLY',
    "card_terminal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "linkly_username" TEXT,
    "linkly_secret_ref" TEXT,
    "linkly_pair_secret_enc" TEXT,
    "linkly_pos_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "location_payment_settings_location_id_key" ON "location_payment_settings"("location_id");

ALTER TABLE "location_payment_settings"
  ADD CONSTRAINT "location_payment_settings_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
