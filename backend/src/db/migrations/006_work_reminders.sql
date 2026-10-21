CREATE TABLE work_reminders (
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, visit_date)
);
