CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  submission_type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  location_text TEXT NOT NULL,
  origin_area TEXT,
  desired_destination TEXT,
  latitude REAL,
  longitude REAL,
  description TEXT NOT NULL,
  concern_mode TEXT NOT NULL,
  additional_notes TEXT,
  photo_key TEXT,
  photo_filename TEXT,
  photo_content_type TEXT,
  photo_uploaded_at TEXT,
  review_status TEXT NOT NULL DEFAULT 'under_review',
  submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_review_status
  ON submissions (review_status);

CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
  ON submissions (submitted_at);
