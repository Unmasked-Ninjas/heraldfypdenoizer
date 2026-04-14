const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("../db");

const router = express.Router();
const RESET_TOKEN_EXPIRES_MINUTES = Number(
  process.env.RESET_TOKEN_EXPIRES_MINUTES || 15,
);

let smtpTransporter;

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM,
  );
}

function getSmtpTransporter() {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return smtpTransporter;
}

async function sendResetTokenEmail({ toEmail, token, expiresInMinutes }) {
  const transporter = getSmtpTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: "Speech Denoiser password reset token",
    text:
      `We received a password reset request for your account.\n\n` +
      `Reset token: ${token}\n` +
      `This token expires in ${expiresInMinutes} minutes.\n\n` +
      `If you did not request this, you can ignore this email.`,
    html:
      `<p>We received a password reset request for your account.</p>` +
      `<p><strong>Reset token:</strong> <code>${token}</code></p>` +
      `<p>This token expires in ${expiresInMinutes} minutes.</p>` +
      `<p>If you did not request this, you can ignore this email.</p>`,
  });
}

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail.includes("@") || password.length < 6) {
    return res.status(400).json({
      message:
        "Please provide a valid email and password with at least 6 characters.",
    });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    if (existing.rowCount > 0) {
      return res.status(409).json({ message: "User already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [normalizedEmail, passwordHash],
    );

    const user = inserted.rows[0];
    return res.status(201).json({
      message: "User created successfully.",
      user,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res
      .status(500)
      .json({ message: "Server error while creating user." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [normalizedEmail],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error while logging in." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ message: "Please provide a valid email." });
  }

  try {
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    let responsePayload = {
      message:
        "If an account exists for that email, a password reset token has been generated.",
    };

    if (userResult.rowCount > 0) {
      const userId = userResult.rows[0].id;
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);

      await pool.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        [userId],
      );

      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)",
        [userId, tokenHash, String(RESET_TOKEN_EXPIRES_MINUTES)],
      );

      if (isSmtpConfigured()) {
        await sendResetTokenEmail({
          toEmail: email,
          token: rawToken,
          expiresInMinutes: RESET_TOKEN_EXPIRES_MINUTES,
        });
      }

      if (!isSmtpConfigured() && process.env.NODE_ENV !== "production") {
        responsePayload = {
          ...responsePayload,
          resetToken: rawToken,
          expiresInMinutes: RESET_TOKEN_EXPIRES_MINUTES,
          devOnly: true,
        };
      }
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ message: "Server error while processing forgot password." });
  }
});

router.post("/reset-password", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !email.includes("@") || !token || newPassword.length < 6) {
    return res.status(400).json({
      message:
        "Email, token and new password are required. Password must be at least 6 characters.",
    });
  }

  try {
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    if (userResult.rowCount === 0) {
      return res.status(400).json({ message: "Invalid reset token or email." });
    }

    const userId = userResult.rows[0].id;
    const tokenHash = hashResetToken(token);

    const tokenResult = await pool.query(
      `SELECT id
       FROM password_reset_tokens
       WHERE user_id = $1
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, tokenHash],
    );

    if (tokenResult.rowCount === 0) {
      return res.status(400).json({ message: "Invalid reset token or email." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      userId,
    ]);

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [userId],
    );

    return res.json({
      message: "Password reset successful. You can login now.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res
      .status(500)
      .json({ message: "Server error while resetting password." });
  }
});

module.exports = router;
