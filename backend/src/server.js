require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const historyRouter = require("./routes/history");
const paymentsRouter = require("./routes/payments");
const { initDb } = require("./db");

const app = express();
// Use Render's environment variable port, fallback to 5000 locally
const PORT = process.env.PORT || 5000;


app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  }),
);
app.use(express.json());
app.use("/media", express.static(path.join(__dirname, "..", "storage")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/history", historyRouter);
app.use("/api/payments", paymentsRouter);

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ message: "Internal server error." });
});
async function start() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasDbFields = Boolean(
    process.env.DB_HOST &&
    process.env.DB_PORT &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD,
  );

  if (!hasDatabaseUrl && !hasDbFields) {
    throw new Error(
      "Missing database config. Set DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in backend/.env",
    );
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT_SECRET in backend/.env");
  }

  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});
