-- Allowlisted platform secrets (HQ-editable). Values stored encrypted.
CREATE TABLE "platform_secrets" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_secrets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_secrets_key_key" ON "platform_secrets"("key");
