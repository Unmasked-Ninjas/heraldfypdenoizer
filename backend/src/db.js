const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

function createPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const pool = new Pool(createPoolConfig());

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    ALTER TABLE audio_history
    ADD COLUMN IF NOT EXISTS original_file_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE audio_history
    ADD COLUMN IF NOT EXISTS denoised_file_url TEXT;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audio_history_user_created_at
    ON audio_history (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens (user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_lookup
    ON password_reset_tokens (user_id, token_hash)
    WHERE used_at IS NULL;
  `);

  const demoEmail = process.env.DEMO_USER_EMAIL;
  const demoPassword = process.env.DEMO_USER_PASSWORD;

  if (demoEmail && demoPassword) {
    const normalizedEmail = demoEmail.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    if (existing.rowCount === 0) {
      const hashed = await bcrypt.hash(demoPassword, 10);
      await pool.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
        [normalizedEmail, hashed],
      );
      console.log(`Demo user created: ${normalizedEmail}`);
    }
  }
}

module.exports = {
  pool,
  initDb,
};
