-- Uploaded files live in the database, so the API needs no disk and can run on serverless hosts.
-- helpers.photo_file and helper_documents.file_name now refer to rows here.
CREATE TABLE uploads (
  kind       text NOT NULL CHECK (kind IN ('photos', 'documents')),
  file_name  text NOT NULL,  -- random name, e.g. 3f1c….png
  mime_type  text NOT NULL,
  data       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, file_name)
);
