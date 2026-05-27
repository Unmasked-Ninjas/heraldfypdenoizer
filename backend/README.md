# Speech Denoiser Backend (Express + PostgreSQL)

## 1) Install

```bash
cd backend
npm install
```

## 2) Configure env

Copy `.env.example` to `.env` and update values.

Required:

- Database config using either:
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (recommended)
  - or `DATABASE_URL` (fallback)
- `JWT_SECRET` (long random string)

Optional:

- `PORT` (default `5000`)
- `CORS_ORIGIN` (default `http://localhost:3000`)
- `ADMIN_EMAILS` (comma-separated list of admin emails)
- `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` (auto-create demo login on startup)
- Forgot password SMTP settings:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
  - `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `RESET_TOKEN_EXPIRES_MINUTES` (default `15`)

## 3) Run server

```bash
npm run dev
```

Health check:

- `GET http://localhost:5000/api/health`

## Auth endpoints

- `POST /api/auth/register`
  - body: `{ "email": "user@example.com", "password": "secret123" }`
- `POST /api/auth/login`
  - body: `{ "email": "user@example.com", "password": "secret123" }`
- `POST /api/auth/forgot-password`
  - body: `{ "email": "user@example.com" }`
  - sends reset token to email when SMTP is configured
- `POST /api/auth/reset-password`
  - body: `{ "email": "user@example.com", "token": "<reset_token>", "newPassword": "newsecret123" }`

Notes:

- In local development, if SMTP is not configured, `/api/auth/forgot-password` returns `resetToken` in response for testing.
- In production, configure SMTP so users receive reset tokens by email.

Login response:

```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

## Audio history endpoints (JWT required)

- `GET /api/history?limit=8`
- `POST /api/history`
  - body example:
    - `{ "originalFilename": "input.wav", "originalSizeBytes": 123456, "denoisedFilename": "denoised.wav", "modelName": "UNet", "status": "completed", "processingMs": 1340 }`

## Table schema

Database schema is available in:

- `db/schema.sql`

Tables:

- `users`
  - `id`, `email`, `password_hash`, `created_at`
- `audio_history`
  - `id`, `user_id`, `original_filename`, `original_size_bytes`, `denoised_filename`, `model_name`, `status`, `processing_ms`, `error_message`, `created_at`, `processed_at`
