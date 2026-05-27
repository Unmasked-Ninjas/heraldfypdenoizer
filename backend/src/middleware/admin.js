function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getAdminAllowlist() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

function isAdminEmail(emailValue) {
  const allowlist = getAdminAllowlist();

  if (!allowlist.length) {
    return false;
  }

  const email = normalizeEmail(emailValue);
  if (!email) {
    return false;
  }

  return allowlist.includes(email);
}

function requireAdmin(req, res, next) {
  const allowlist = getAdminAllowlist();

  if (!allowlist.length) {
    return res.status(403).json({
      message: "Admin access not configured. Set ADMIN_EMAILS in backend/.env.",
    });
  }

  const email = normalizeEmail(req.user?.email);
  if (!email || !allowlist.includes(email)) {
    return res
      .status(403)
      .json({ message: "Forbidden. Admin access required." });
  }

  return next();
}

module.exports = {
  isAdminEmail,
  requireAdmin,
};
