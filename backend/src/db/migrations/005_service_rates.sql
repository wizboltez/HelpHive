-- A helper's rate for each service they offer, e.g. {"Cooking": 150, "Cleaning": 100}.
-- Existing helpers start with their single rate for every service.
ALTER TABLE helpers ADD COLUMN category_rates jsonb NOT NULL DEFAULT '{}';
UPDATE helpers SET category_rates = (SELECT coalesce(jsonb_object_agg(c, rate_per_visit), '{}') FROM unnest(categories) c)
WHERE rate_per_visit > 0;

-- The services a resident booked. rate_per_visit is the sum of their rates.
ALTER TABLE bookings ADD COLUMN categories text[] NOT NULL DEFAULT '{}';
