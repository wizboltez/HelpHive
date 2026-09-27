-- HelpHive schema. Money is stored in whole rupees.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text NOT NULL CHECK (role IN ('resident', 'worker', 'admin')),
  name          text NOT NULL,
  username      text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL,
  place         text NOT NULL DEFAULT '',  -- flat number for residents, area served for workers
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_idx ON users (lower(username));
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

-- Public profile for every worker. Hidden from residents until an admin verifies it.
CREATE TABLE helpers (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL DEFAULT '',  -- e.g. "Housekeeping · cooking"
  summary           text NOT NULL DEFAULT '',
  photo_file        text,                      -- file name inside UPLOAD_DIR/photos
  rate_per_visit    integer NOT NULL DEFAULT 0 CHECK (rate_per_visit >= 0),
  is_accepting      boolean NOT NULL DEFAULT true,
  verification      text NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending', 'verified', 'rejected')),
  verification_note text,
  verified_at       timestamptz
);

CREATE TABLE helper_documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id  uuid NOT NULL REFERENCES helpers(user_id) ON DELETE CASCADE,
  doc_type   text NOT NULL CHECK (doc_type IN ('id_proof', 'address_proof', 'police_verification', 'other')),
  file_name  text NOT NULL,  -- stored file inside UPLOAD_DIR/documents
  mime_type  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Extra services, e.g. "Daily chapatis" (charged per visit) or "Event food help" (charged once).
CREATE TABLE helper_services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id    uuid NOT NULL REFERENCES helpers(user_id) ON DELETE CASCADE,
  label        text NOT NULL,
  price        integer NOT NULL CHECK (price >= 0),
  unit         text NOT NULL CHECK (unit IN ('visit', 'event')),
  is_available boolean NOT NULL DEFAULT true
);

CREATE TABLE helper_leaves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id  uuid NOT NULL REFERENCES helpers(user_id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  reason     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id    uuid NOT NULL REFERENCES users(id),
  helper_id      uuid NOT NULL REFERENCES helpers(user_id),
  flat           text NOT NULL,
  plan           text NOT NULL CHECK (plan IN ('one_time', 'weekly', 'monthly')),
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  days           text[] NOT NULL,  -- weekdays the helper comes, e.g. {Mon,Wed,Fri}
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  visits         integer NOT NULL,
  rate_per_visit integer NOT NULL,
  extras         jsonb NOT NULL DEFAULT '[]',  -- snapshot of chosen services and their price
  total          integer NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  notes          text NOT NULL DEFAULT '',
  cancel_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_time > start_time)
);
CREATE INDEX bookings_helper_idx ON bookings (helper_id, status);
CREATE INDEX bookings_resident_idx ON bookings (resident_id, status);

-- One row per booked day, created the first time that day is looked at.
-- Holds the door code the helper enters on arrival and on leaving.
CREATE TABLE visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  visit_date      date NOT NULL,
  door_code       text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  UNIQUE (booking_id, visit_date)
);

CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  helper_id   uuid NOT NULL REFERENCES helpers(user_id),
  resident_id uuid NOT NULL REFERENCES users(id),
  stars       smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE complaints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raised_by   uuid NOT NULL REFERENCES users(id),
  helper_id   uuid REFERENCES helpers(user_id),
  booking_id  uuid REFERENCES bookings(id),
  subject     text NOT NULL,
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
