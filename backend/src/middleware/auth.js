const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Missing or invalid authorization header." });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = {
  requireAuth,
};
