-- Each helper's regular working hours, e.g. Mon–Sat 08:00–18:00.
-- Shown to residents on the profile and schedule; bookings must fall inside them.
ALTER TABLE helpers ADD COLUMN work_days  text[] NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri,Sat}';
ALTER TABLE helpers ADD COLUMN work_start time   NOT NULL DEFAULT '08:00';
ALTER TABLE helpers ADD COLUMN work_end   time   NOT NULL DEFAULT '18:00';
ALTER TABLE helpers ADD CONSTRAINT helpers_work_hours_check CHECK (work_end > work_start);
