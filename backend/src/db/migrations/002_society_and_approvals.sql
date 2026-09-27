-- Buildings in the society, managed by the admin. Users pick one when signing up.
CREATE TABLE buildings (
  name       text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN building text REFERENCES buildings(name) ON UPDATE CASCADE;

-- Helpers choose service categories (see src/lib/catalog.ts) instead of a free-text title.
ALTER TABLE helpers DROP COLUMN title;
ALTER TABLE helpers ADD COLUMN categories text[] NOT NULL DEFAULT '{}';
-- Set when a new helper finishes the onboarding steps.
ALTER TABLE helpers ADD COLUMN onboarded_at timestamptz;

-- Name typed by the helper when the document type is "other".
ALTER TABLE helper_documents ADD COLUMN doc_label text;

-- Page to open when the notification is clicked, e.g. /admin?tab=verification
ALTER TABLE notifications ADD COLUMN link text;

-- Edits a verified helper makes to their public profile wait here for admin approval.
CREATE TABLE profile_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id   uuid NOT NULL REFERENCES helpers(user_id) ON DELETE CASCADE,
  changes     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
-- At most one open request per helper; new edits are merged into it.
CREATE UNIQUE INDEX profile_changes_one_pending ON profile_changes (helper_id) WHERE status = 'pending';
