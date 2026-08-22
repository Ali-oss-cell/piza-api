-- Optional Google Search Console HTML-tag verification token per store.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "google_site_verification" TEXT;
