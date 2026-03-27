CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug TEXT NOT NULL,
  parent_id INTEGER DEFAULT 0,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_avatar TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'approved',
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_post_slug ON comments(post_slug);
CREATE INDEX IF NOT EXISTS idx_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_created_at ON comments(created_at);

