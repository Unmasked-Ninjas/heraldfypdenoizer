const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isAdminEmail, requireAdmin } = require("../middleware/admin");

const router = express.Router();

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

    if (!isAdminEmail(user.email)) {
      return res
        .status(403)
        .json({ message: "Admin access not configured or not allowed." });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.json({
      token,
      admin: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Server error while logging in." });
  }
});

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const parsedLimit = Number(req.query.limit || 200);
  const limit = Number.isNaN(parsedLimit)
    ? 200
    : Math.min(Math.max(parsedLimit, 1), 500);

  try {
    const totalResult = await pool.query("SELECT COUNT(*) AS count FROM users");
    const totalUsers = Number(totalResult.rows[0]?.count || 0);

    const result = await pool.query(
      `
        SELECT
          u.id,
          u.email,
          u.credits,
          u.created_at,
          COALESCE(ct.package_id, 'free') AS plan_id,
          ct.created_at AS last_purchase_at,
          ah.last_denoise_at,
          ah.total_denoises
        FROM users u
        LEFT JOIN LATERAL (
          SELECT package_id, created_at
          FROM credit_transactions
          WHERE user_id = u.id
          ORDER BY created_at DESC
          LIMIT 1
        ) ct ON true
        LEFT JOIN LATERAL (
          SELECT MAX(created_at) AS last_denoise_at, COUNT(*) AS total_denoises
          FROM audio_history
          WHERE user_id = u.id
        ) ah ON true
        ORDER BY u.created_at DESC
        LIMIT $1
      `,
      [limit],
    );

    return res.json({ totalUsers, users: result.rows });
  } catch (error) {
    console.error("Admin users fetch error:", error);
    return res
      .status(500)
      .json({ message: "Could not fetch admin user list." });
  }
});

module.exports = router;
