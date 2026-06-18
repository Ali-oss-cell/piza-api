ALTER TABLE "orders"
  ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "orders_client_request_id_key" ON "orders"("client_request_id");
