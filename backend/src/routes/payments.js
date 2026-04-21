const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const KHALTI_BASE_URL =
  process.env.KHALTI_BASE_URL || "https://dev.khalti.com/api/v2";

let smtpTransporter;

function getKhaltiSecretKey() {
  return (
    process.env.KHALTI_SECRET_KEY ||
    process.env.KHALTI_LIVE_SECRET_KEY ||
    process.env.KHALTI_TEST_SECRET_KEY ||
    ""
  ).trim();
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

async function sendCreditPurchaseInvoiceEmail({
  toEmail,
  packageName,
  packageId,
  creditsAdded,
  amountPaisa,
  purchaseOrderId,
  pidx,
  purchasedAt,
}) {
  const transporter = getSmtpTransporter();
  const amountNpr = (Number(amountPaisa) / 100).toFixed(2);
  const billNo = `INV-${String(pidx || "")
    .slice(0, 10)
    .toUpperCase()}`;
  const purchasedDateText = new Date(
    purchasedAt || Date.now(),
  ).toLocaleString();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: `Speech Denoizer Invoice ${billNo}`,
    text:
      `Payment successful.\n\n` +
      `Invoice: ${billNo}\n` +
      `Package: ${packageName} (${packageId})\n` +
      `Credits Added: ${creditsAdded}\n` +
      `Amount: NPR ${amountNpr}\n` +
      `Purchase Order ID: ${purchaseOrderId || "-"}\n` +
      `Khalti PIDX: ${pidx}\n` +
      `Purchased At: ${purchasedDateText}\n\n` +
      `Thank you for using Speech Denoizer.`,
    html:
      `<p>Payment successful.</p>` +
      `<p><strong>Invoice:</strong> ${billNo}</p>` +
      `<p><strong>Package:</strong> ${packageName} (${packageId})</p>` +
      `<p><strong>Credits Added:</strong> ${creditsAdded}</p>` +
      `<p><strong>Amount:</strong> NPR ${amountNpr}</p>` +
      `<p><strong>Purchase Order ID:</strong> ${purchaseOrderId || "-"}</p>` +
      `<p><strong>Khalti PIDX:</strong> ${pidx}</p>` +
      `<p><strong>Purchased At:</strong> ${purchasedDateText}</p>` +
      `<p>Thank you for using Speech Denoizer.</p>`,
  });
}

const CREDIT_PACKAGES = {
  starter: {
    id: "starter",
    name: "Starter Credits",
    credits: 25,
    amountPaisa: 50000,
  },
  standard: {
    id: "standard",
    name: "Standard Credits",
    credits: 50,
    amountPaisa: 90000,
  },
  pro: {
    id: "pro",
    name: "Pro Credits",
    credits: 100,
    amountPaisa: 170000,
  },
};

router.use(requireAuth);

router.get("/packages", (_req, res) => {
  return res.json({ packages: Object.values(CREDIT_PACKAGES) });
});

router.post("/khalti/initiate", async (req, res) => {
  const packageId = String(req.body?.packageId || "starter").toLowerCase();
  const selectedPackage = CREDIT_PACKAGES[packageId];

  if (!selectedPackage) {
    return res.status(400).json({
      message: "Invalid credit package selected.",
    });
  }

  const khaltiSecretKey = getKhaltiSecretKey();

  if (!khaltiSecretKey) {
    return res.status(500).json({
      message:
        "Khalti is not configured on server. Set KHALTI_SECRET_KEY in backend/.env and restart backend.",
    });
  }

  try {
    const websiteUrl = process.env.FRONTEND_BASE_URL || process.env.CORS_ORIGIN;
    const returnUrl = process.env.KHALTI_RETURN_URL || `${websiteUrl}/`;

    const purchaseOrderId = `SD-${req.user.userId}-${selectedPackage.id}-${Date.now()}-${crypto
      .randomBytes(3)
      .toString("hex")}`;

    const payload = {
      return_url: returnUrl,
      website_url: websiteUrl,
      amount: selectedPackage.amountPaisa,
      purchase_order_id: purchaseOrderId,
      purchase_order_name: `${selectedPackage.name} (${selectedPackage.credits} credits)`,
      customer_info: {
        name: req.user.email.split("@")[0] || "Speech Denoiser User",
        email: req.user.email,
      },
      amount_breakdown: [
        {
          label: "Credit Package",
          amount: selectedPackage.amountPaisa,
        },
      ],
      product_details: [
        {
          identity: selectedPackage.id,
          name: selectedPackage.name,
          total_price: selectedPackage.amountPaisa,
          quantity: 1,
          unit_price: selectedPackage.amountPaisa,
        },
      ],
      merchant_username: process.env.KHALTI_MERCHANT_USERNAME || undefined,
      merchant_extra: JSON.stringify({
        userId: req.user.userId,
        email: req.user.email,
        packageId: selectedPackage.id,
        credits: selectedPackage.credits,
      }),
    };

    const response = await fetch(`${KHALTI_BASE_URL}/epayment/initiate/`, {
      method: "POST",
      headers: {
        Authorization: `Key ${khaltiSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: result?.detail || "Could not initiate Khalti payment.",
      });
    }

    return res.json({
      paymentUrl: result?.payment_url,
      pidx: result?.pidx,
      package: selectedPackage,
    });
  } catch (error) {
    console.error("Khalti initiate error:", error);
    return res.status(500).json({
      message: "Server error while initiating Khalti payment.",
    });
  }
});

function parsePackageFromPurchaseOrderId(purchaseOrderId) {
  const id = String(purchaseOrderId || "");
  // Supports both current format: SD-<userId>-<packageId>-<ts>-<rand>
  // and legacy/changed formats by scanning token candidates.
  const parts = id.split("-").map((part) => part.trim().toLowerCase());
  if (parts.length === 0) return null;

  const packageId = parts.find((part) => CREDIT_PACKAGES[part]);
  return CREDIT_PACKAGES[packageId] || null;
}

function parsePackageFromPurchaseOrderName(purchaseOrderName) {
  const name = String(purchaseOrderName || "").toLowerCase();
  if (!name) return null;

  return (
    Object.values(CREDIT_PACKAGES).find((pkg) =>
      name.includes(pkg.name.toLowerCase()),
    ) || null
  );
}

function parsePackageFromAmount(totalAmount) {
  const amount = Number(totalAmount);
  if (!Number.isFinite(amount)) return null;

  return (
    Object.values(CREDIT_PACKAGES).find((pkg) => pkg.amountPaisa === amount) ||
    null
  );
}

router.post("/khalti/confirm", async (req, res) => {
  const pidx = String(req.body?.pidx || req.body?.idx || "").trim();

  if (!pidx) {
    return res.status(400).json({ message: "pidx is required." });
  }

  const khaltiSecretKey = getKhaltiSecretKey();

  if (!khaltiSecretKey) {
    return res.status(500).json({
      message:
        "Khalti is not configured on server. Set KHALTI_SECRET_KEY in backend/.env and restart backend.",
    });
  }

  try {
    const lookupResponse = await fetch(`${KHALTI_BASE_URL}/epayment/lookup/`, {
      method: "POST",
      headers: {
        Authorization: `Key ${khaltiSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pidx }),
    });

    const lookupResult = await lookupResponse.json();

    if (!lookupResponse.ok) {
      return res.status(lookupResponse.status).json({
        message: lookupResult?.detail || "Could not verify Khalti payment.",
      });
    }

    if (lookupResult?.status !== "Completed") {
      return res.status(400).json({
        message: `Payment is not completed. Current status: ${lookupResult?.status || "unknown"}.`,
      });
    }

    const packageFromOrder =
      parsePackageFromPurchaseOrderId(lookupResult?.purchase_order_id) ||
      parsePackageFromPurchaseOrderName(lookupResult?.purchase_order_name) ||
      parsePackageFromAmount(lookupResult?.total_amount);

    if (!packageFromOrder) {
      return res
        .status(400)
        .json({ message: "Could not determine purchased credit package." });
    }

    if (Number(lookupResult?.total_amount) !== packageFromOrder.amountPaisa) {
      return res.status(400).json({
        message: "Payment amount does not match the selected credit package.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertedTransaction = await client.query(
        `
          INSERT INTO credit_transactions (
            user_id,
            provider,
            pidx,
            purchase_order_id,
            package_id,
            amount_paisa,
            credits_added,
            status,
            provider_payload
          )
          VALUES ($1, 'khalti', $2, $3, $4, $5, $6, 'completed', $7::jsonb)
          ON CONFLICT (pidx) DO NOTHING
          RETURNING id
        `,
        [
          req.user.userId,
          pidx,
          lookupResult?.purchase_order_id || null,
          packageFromOrder.id,
          packageFromOrder.amountPaisa,
          packageFromOrder.credits,
          JSON.stringify(lookupResult),
        ],
      );

      if (insertedTransaction.rowCount === 0) {
        const existingCredits = await client.query(
          "SELECT credits FROM users WHERE id = $1",
          [req.user.userId],
        );
        await client.query("COMMIT");
        return res.json({
          message: "Payment already processed.",
          credits: existingCredits.rows[0]?.credits || 0,
          alreadyProcessed: true,
        });
      }

      const updatedUser = await client.query(
        "UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits",
        [packageFromOrder.credits, req.user.userId],
      );

      await client.query("COMMIT");

      if (isSmtpConfigured()) {
        try {
          await sendCreditPurchaseInvoiceEmail({
            toEmail: req.user.email,
            packageName: packageFromOrder.name,
            packageId: packageFromOrder.id,
            creditsAdded: packageFromOrder.credits,
            amountPaisa: packageFromOrder.amountPaisa,
            purchaseOrderId: lookupResult?.purchase_order_id,
            pidx,
            purchasedAt: lookupResult?.created_at || Date.now(),
          });
        } catch (mailError) {
          console.error("Invoice email send error:", mailError.message);
        }
      }

      return res.json({
        message: "Payment verified and credits added successfully.",
        creditsAdded: packageFromOrder.credits,
        credits: updatedUser.rows[0]?.credits || 0,
      });
    } catch (dbError) {
      await client.query("ROLLBACK");
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Khalti confirm error:", error);
    return res.status(500).json({
      message: "Server error while confirming Khalti payment.",
    });
  }
});

module.exports = router;
