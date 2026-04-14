CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_history (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename VARCHAR(255) NOT NULL,
  original_file_url TEXT,
  original_size_bytes BIGINT,
  denoised_filename VARCHAR(255),
  denoised_file_url TEXT,
  model_name VARCHAR(100) NOT NULL DEFAULT 'UNet',
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  processing_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audio_history_user_created_at
  ON audio_history (user_id, created_at DESC);
