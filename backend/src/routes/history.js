const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const audioStorageDir = path.join(__dirname, "..", "..", "storage", "audio");

function getSafeExtension(filename, fallback = ".wav") {
  const ext = path.extname(filename || "").toLowerCase();
  if (!ext || ext.length > 8) return fallback;
  return ext;
}

function buildPublicUrl(req, fileName) {
  const explicitBase = process.env.PUBLIC_BASE_URL;
  const baseUrl = explicitBase || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/media/audio/${fileName}`;
}

function getMediaPathFromUrl(urlValue) {
  if (!urlValue) return null;

  try {
    const parsed = new URL(urlValue);
    if (!parsed.pathname.startsWith("/media/audio/")) return null;
    const fileName = path.basename(parsed.pathname);
    return path.join(audioStorageDir, fileName);
  } catch (_error) {
    return null;
  }
}

router.use(requireAuth);

router.post(
  "/upload-assets",
  upload.fields([
    { name: "original", maxCount: 1 },
    { name: "denoised", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const originalFile = req.files?.original?.[0];
      const denoisedFile = req.files?.denoised?.[0];

      if (!originalFile) {
        return res.status(400).json({ message: "original file is required." });
      }

      await fs.mkdir(audioStorageDir, { recursive: true });

      const stamp = `${Date.now()}-${req.user.userId}-${Math.random().toString(16).slice(2, 10)}`;
      const originalName = `orig-${stamp}${getSafeExtension(originalFile.originalname, ".wav")}`;
      const originalPath = path.join(audioStorageDir, originalName);
      await fs.writeFile(originalPath, originalFile.buffer);

      let denoisedUrl = null;
      if (denoisedFile) {
        const denoisedName = `denoised-${stamp}${getSafeExtension(denoisedFile.originalname, ".wav")}`;
        const denoisedPath = path.join(audioStorageDir, denoisedName);
        await fs.writeFile(denoisedPath, denoisedFile.buffer);
        denoisedUrl = buildPublicUrl(req, denoisedName);
      }

      return res.status(201).json({
        originalFileUrl: buildPublicUrl(req, originalName),
        denoisedFileUrl: denoisedUrl,
      });
    } catch (error) {
      console.error("Upload assets error:", error);
      return res
        .status(500)
        .json({ message: "Could not upload audio assets." });
    }
  },
);

router.get("/", async (req, res) => {
  const parsedLimit = Number(req.query.limit || 10);
  const limit = Number.isNaN(parsedLimit)
    ? 10
    : Math.min(Math.max(parsedLimit, 1), 100);

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          original_filename,
          original_file_url,
          original_size_bytes,
          denoised_filename,
          denoised_file_url,
          model_name,
          status,
          processing_ms,
          error_message,
          created_at,
          processed_at
        FROM audio_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [req.user.userId, limit],
    );

    return res.json({ history: result.rows });
  } catch (error) {
    console.error("Fetch history error:", error);
    return res.status(500).json({ message: "Could not fetch audio history." });
  }
});

router.post("/", async (req, res) => {
  const {
    originalFilename,
    originalSizeBytes,
    denoisedFilename,
    originalFileUrl,
    denoisedFileUrl,
    modelName,
    status,
    processingMs,
    errorMessage,
  } = req.body;

  if (!originalFilename) {
    return res.status(400).json({ message: "originalFilename is required." });
  }

  const safeStatus = ["queued", "processing", "completed", "failed"].includes(
    status,
  )
    ? status
    : "completed";
  const processedAt =
    safeStatus === "completed" || safeStatus === "failed" ? new Date() : null;

  try {
    const inserted = await pool.query(
      `
        INSERT INTO audio_history (
          user_id,
          original_filename,
          original_file_url,
          original_size_bytes,
          denoised_filename,
          denoised_file_url,
          model_name,
          status,
          processing_ms,
          error_message,
          processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          original_filename,
          original_file_url,
          original_size_bytes,
          denoised_filename,
          denoised_file_url,
          model_name,
          status,
          processing_ms,
          error_message,
          created_at,
          processed_at
      `,
      [
        req.user.userId,
        String(originalFilename).slice(0, 255),
        originalFileUrl ? String(originalFileUrl) : null,
        Number.isFinite(Number(originalSizeBytes))
          ? Number(originalSizeBytes)
          : null,
        denoisedFilename ? String(denoisedFilename).slice(0, 255) : null,
        denoisedFileUrl ? String(denoisedFileUrl) : null,
        modelName ? String(modelName).slice(0, 100) : "UNet",
        safeStatus,
        Number.isFinite(Number(processingMs)) ? Number(processingMs) : null,
        errorMessage ? String(errorMessage) : null,
        processedAt,
      ],
    );

    return res.status(201).json({ entry: inserted.rows[0] });
  } catch (error) {
    console.error("Create history error:", error);
    return res
      .status(500)
      .json({ message: "Could not create audio history entry." });
  }
});

router.delete("/:id", async (req, res) => {
  const historyId = Number(req.params.id);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    return res.status(400).json({ message: "Invalid history id." });
  }

  try {
    const existing = await pool.query(
      `
        SELECT id, original_file_url, denoised_file_url
        FROM audio_history
        WHERE id = $1 AND user_id = $2
      `,
      [historyId, req.user.userId],
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ message: "History entry not found." });
    }

    await pool.query(
      "DELETE FROM audio_history WHERE id = $1 AND user_id = $2",
      [historyId, req.user.userId],
    );

    const row = existing.rows[0];
    const pathsToDelete = [
      getMediaPathFromUrl(row.original_file_url),
      getMediaPathFromUrl(row.denoised_file_url),
    ].filter(Boolean);

    await Promise.all(
      pathsToDelete.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.warn(
              "Could not delete media file:",
              filePath,
              error.message,
            );
          }
        }
      }),
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete history error:", error);
    return res.status(500).json({ message: "Could not delete history entry." });
  }
});

module.exports = router;
