-- Seed default Melb hours for locations that have none yet (Mon–Fri 5–11, Sat–Sun 12–midnight)
UPDATE "locations"
SET "opening_hours" = '{
  "timezone": "Australia/Melbourne",
  "leadTimeMinutes": 45,
  "slotIntervalMinutes": 15,
  "days": {
    "monday": {"open": "17:00", "close": "23:00"},
    "tuesday": {"open": "17:00", "close": "23:00"},
    "wednesday": {"open": "17:00", "close": "23:00"},
    "thursday": {"open": "17:00", "close": "23:00"},
    "friday": {"open": "17:00", "close": "23:00"},
    "saturday": {"open": "12:00", "close": "23:59"},
    "sunday": {"open": "12:00", "close": "23:59"}
  }
}'::jsonb
WHERE "opening_hours" IS NULL;
