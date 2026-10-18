-- Per-category surcharge override for crust options (e.g. gluten-free +$3 on Basic, +$4 elsewhere).
ALTER TABLE "crust_options" ADD COLUMN "category_price_deltas" JSONB;
