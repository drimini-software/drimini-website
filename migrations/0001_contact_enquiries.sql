CREATE TABLE IF NOT EXISTS contact_enquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL,
  timeline TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  privacy_notice_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contact_enquiries_status_created_at
  ON contact_enquiries (status, created_at DESC);
