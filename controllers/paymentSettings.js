import {
  getPaymentSettings,
  invalidatePaymentSettingsCache,
  buildDiagnostics,
  resolvePaymentDecision,
} from "../services/paymentAvailability.js";

// E.164: '+' then 8–15 digits, first digit non-zero.
const E164 = /^\+[1-9]\d{7,14}$/;

// Keep copy as plain text within a sane length. React renders it as text (auto
// escaped), so we only strip control chars and cap length here — never store HTML.
const cleanText = (v, max) =>
  `${v ?? ""}`.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);

// GET /api/admin/payment-settings — full settings + derived diagnostics (admin).
export const getAdminPaymentSettings = async (req, res) => {
  const s = await getPaymentSettings({ fresh: true });
  return res.json({
    paymentMaintenance: s.paymentMaintenance,
    whatsappNumber: s.whatsappNumber || "",
    noticeHeading: s.noticeHeading,
    noticeBody: s.noticeBody,
    noticeCtaLabel: s.noticeCtaLabel,
    diagnostics: buildDiagnostics(s),
    auditLog: (s.auditLog || []).slice(-20).reverse(), // most recent first
  });
};

// PUT /api/admin/payment-settings — update toggle/number/copy (admin, audited).
export const updatePaymentSettings = async (req, res) => {
  const s = await getPaymentSettings({ fresh: true });
  const { paymentMaintenance, whatsappNumber, noticeHeading, noticeBody, noticeCtaLabel } = req.body || {};

  const changes = [];

  if (typeof paymentMaintenance === "boolean" && paymentMaintenance !== s.paymentMaintenance) {
    s.paymentMaintenance = paymentMaintenance;
    changes.push({
      action: paymentMaintenance ? "maintenance_on" : "maintenance_off",
      detail: paymentMaintenance
        ? "Payment maintenance turned ON (online payments blocked)"
        : "Payment maintenance turned OFF (live payments may be accepted)",
    });
  }

  if (whatsappNumber !== undefined) {
    const n = `${whatsappNumber}`.trim();
    if (n && !E164.test(n)) {
      return res.status(400).json({ error: "WhatsApp number must be E.164 format, e.g. +919812345678" });
    }
    if (n !== s.whatsappNumber) {
      s.whatsappNumber = n;
      changes.push({ action: "update_whatsapp", detail: n ? "WhatsApp number updated" : "WhatsApp number cleared" });
    }
  }

  if (noticeHeading !== undefined) s.noticeHeading = cleanText(noticeHeading, 140) || s.noticeHeading;
  if (noticeBody !== undefined) s.noticeBody = cleanText(noticeBody, 600) || s.noticeBody;
  if (noticeCtaLabel !== undefined) s.noticeCtaLabel = cleanText(noticeCtaLabel, 40) || s.noticeCtaLabel;
  if (noticeHeading !== undefined || noticeBody !== undefined || noticeCtaLabel !== undefined) {
    changes.push({ action: "update_copy", detail: "Customer-facing notice copy updated" });
  }

  // Record who + what, capped at 100 entries.
  const by = req.user?._id ? `${req.user._id}` : "";
  const byEmail = req.user?.email || "";
  s.updatedById = by;
  s.updatedByEmail = byEmail;
  changes.forEach((c) => s.auditLog.push({ ...c, by, byEmail, at: new Date() }));
  if (s.auditLog.length > 100) s.auditLog = s.auditLog.slice(-100);

  await s.save();
  invalidatePaymentSettingsCache();

  return res.json({
    ok: true,
    paymentMaintenance: s.paymentMaintenance,
    whatsappNumber: s.whatsappNumber || "",
    noticeHeading: s.noticeHeading,
    noticeBody: s.noticeBody,
    noticeCtaLabel: s.noticeCtaLabel,
    diagnostics: buildDiagnostics(s),
  });
};

// GET /api/payment-capability — AUTHENTICATED. Tells the client whether THIS
// user may start a payment right now, and in which mode, so the authorized test
// account still sees the real pay button during maintenance. No secrets/keys.
export const getPaymentCapability = async (req, res) => {
  const decision = await resolvePaymentDecision(req.user);
  return res.json({
    allowed: decision.allowed,
    mode: decision.mode,       // "live" | "test" | "blocked"
    reason: decision.reason,
  });
};

// GET /api/payment-status — PUBLIC. Only what the client needs to render the
// notice + enquiry CTA. No secrets, no audit, no diagnostics.
export const getPublicPaymentStatus = async (req, res) => {
  let s;
  try {
    s = await getPaymentSettings();
  } catch (e) {
    // Fail closed for the UI too: present maintenance ON with safe copy.
    return res.json({
      maintenance: true,
      whatsapp: "",
      heading: "Online payments are temporarily unavailable",
      body: "Please enquire with the Nomadic Townies team for help with your booking.",
      ctaLabel: "Contact us",
    });
  }
  return res.json({
    maintenance: s.paymentMaintenance,
    whatsapp: s.whatsappNumber || "",
    heading: s.noticeHeading,
    body: s.noticeBody,
    ctaLabel: s.noticeCtaLabel,
  });
};
