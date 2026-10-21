ALTER TABLE bookings ADD COLUMN booked_categories text[] NOT NULL DEFAULT '{}';
