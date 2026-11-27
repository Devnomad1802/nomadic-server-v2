// ─────────────────────────────────────────────────────────────
// Admin "Add Customer" — directive §3
//
// Create a minimal, pending-activation customer profile for an assisted
// booking. Rules (directive §3):
//   • Normalise email/phone; search for an existing customer first.
//   • Do NOT merge accounts. An email that already exists → return the existing
//     profile for the admin to use (never a duplicate). A phone that belongs to
//     a DIFFERENT account → flag for manual resolution, do not create.
//   • Do NOT set or send a password. Do NOT mark email/phone verified just
//     because an admin typed them (isVerified stays false).
//   • Record consent/authorisation and the admin actor (audit).
// A pending-activation profile CAN receive a booking; the customer activates
// later through the existing login / forgot-password flow.
// ─────────────────────────────────────────────────────────────
import { User } from "../models/index.js";

// ── Pure helpers (exported for unit tests; no DB) ────────────────────────────

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Keep a leading "+" (international dialling) and digits only; drop spaces,
// dashes, brackets. Returns "" for junk.
export const normalizePhone = (phone) => {
  const s = String(phone || "").trim();
  if (!s) return "";
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : "";
};

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
// At least 8 digits (loose international check — we don't guess country rules).
export const isValidPhone = (phone) => String(phone || "").replace(/\D/g, "").length >= 8;

/**
 * Decide what to do given existing matches (pass the matched docs or null).
 * Pure — the caller does the DB lookups.
 *   emailMatch present              → EMAIL_EXISTS (reuse it, never duplicate)
 *   phoneMatch present (diff acct)  → PHONE_CONFLICT (manual resolution)
 *   neither                         → ok to create
 */
export const classifyCustomerConflict = (emailMatch, phoneMatch) => {
  if (emailMatch) return { ok: false, code: "EMAIL_EXISTS", userId: `${emailMatch._id}` };
  if (phoneMatch) return { ok: false, code: "PHONE_CONFLICT", userId: `${phoneMatch._id}` };
  return { ok: true };
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── POST /api/auth/admin/customers  (admin) ──────────────────────────────────
export const createCustomer = async (req, res) => {
  try {
    const adminId = req.user?._id;
    const { name, email, phone, consent } = req.body || {};

    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: "name, email and phone are required" });
    }
    if (!consent) {
      return res.status(400).json({ success: false, message: "Customer consent/authorisation must be confirmed", code: "CONSENT_REQUIRED" });
    }

    const normEmail = normalizeEmail(email);
    const normPhone = normalizePhone(phone);
    if (!isValidEmail(normEmail)) return res.status(400).json({ success: false, message: "Invalid email" });
    if (!isValidPhone(normPhone)) return res.status(400).json({ success: false, message: "Invalid phone (include country code)" });

    // Case-insensitive exact email match; normalised phone match.
    const [emailMatch, phoneMatch] = await Promise.all([
      User.findOne({ email: new RegExp(`^${escapeRegex(normEmail)}$`, "i") }).select("_id name email phone role").lean(),
      User.findOne({ phone: normPhone }).select("_id name email phone role").lean(),
    ]);

    const verdict = classifyCustomerConflict(emailMatch, phoneMatch && (!emailMatch || `${phoneMatch._id}` !== `${emailMatch._id}`) ? phoneMatch : null);
    if (!verdict.ok) {
      const existing = verdict.code === "EMAIL_EXISTS" ? emailMatch : phoneMatch;
      return res.status(409).json({
        success: false,
        code: verdict.code,
        message: verdict.code === "EMAIL_EXISTS"
          ? "A customer with this email already exists — use that profile."
          : "This phone number belongs to a different account — resolve manually before creating.",
        customer: existing ? { _id: `${existing._id}`, name: existing.name, email: existing.email, phone: existing.phone } : null,
      });
    }

    // Create a pending-activation customer. No password; not verified.
    const user = new User({
      name: String(name).trim(),
      email: normEmail,
      phone: normPhone,
      role: "Customer",
      isVerified: false,
      createdVia: "admin_assisted",
      createdBy: adminId,
      consentGiven: true,
      consentAt: new Date(),
    });
    await user.save();

    return res.status(201).json({
      success: true,
      message: "Customer created (pending activation). They can be booked now and activate later via login / password reset.",
      customer: { _id: `${user._id}`, name: user.name, email: user.email, phone: user.phone, isVerified: false, role: "Customer" },
    });
  } catch (error) {
    console.error("createCustomer error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Could not create customer" });
  }
};
