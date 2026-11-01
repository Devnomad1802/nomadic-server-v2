import "dotenv/config";
import { PaymentSettings } from "../models/index.js";

/**
 * paymentAvailability — the single source of truth for whether a payment may
 * start right now, and in which Razorpay mode. Used by the payment gate
 * middleware and the public/admin status endpoints.
 *
 * Security posture:
 *  - Defaults are SAFE: if the settings doc is missing, maintenance is ON.
 *  - If the DB lookup FAILS, we FAIL CLOSED (treat as maintenance ON) so a DB
 *    blip can never open a payment window.
 *  - The only way to a LIVE payment is an explicit admin toggle OFF.
 *  - The authorized test account may use a TEST order only when real test
 *    credentials AND an explicit isolation flag are present (staging only).
 */

// The single authorized test identity (server-verified, see isAuthorizedTestUser).
// Owner-specified; overridable per-environment via AUTHORIZED_TEST_EMAIL.
export const AUTHORIZED_TEST_EMAIL = (
  process.env.AUTHORIZED_TEST_EMAIL || "hmtenten94@gmail.com"
).trim().toLowerCase();

// Short in-process cache so the hot payment path doesn't hit Mongo every call,
// while a toggle still takes effect within a few seconds across instances.
let _cache = { at: 0, doc: null };
const CACHE_TTL_MS = 5000;

export const invalidatePaymentSettingsCache = () => {
  _cache = { at: 0, doc: null };
};

// Fetch (and lazily create) the singleton settings doc. Throws on DB error so
// callers can fail closed.
export const getPaymentSettings = async ({ fresh = false } = {}) => {
  const now = Date.now();
  if (!fresh && _cache.doc && now - _cache.at < CACHE_TTL_MS) return _cache.doc;
  let doc = await PaymentSettings.findOne({ key: "payment" });
  if (!doc) {
    // First run — create with safe defaults (maintenance ON).
    doc = await PaymentSettings.create({ key: "payment" });
  }
  _cache = { at: now, doc };
  return doc;
};

// Normalise an email for a constant-ish comparison.
const normEmail = (e) => `${e || ""}`.trim().toLowerCase();

// Is this request's SERVER-VERIFIED user the authorized test identity?
// Requires a real authenticated user object (from JWT), a verified email, and
// an exact normalised match. An email string in the body is NEVER trusted.
export const isAuthorizedTestUser = (user) =>
  !!(user && user.isVerified === true && normEmail(user.email) === AUTHORIZED_TEST_EMAIL);

// Is a safely-isolated Razorpay TEST environment configured? Staging only:
// requires explicit test keys AND an explicit isolation flag. Never falls back
// to live keys. In production (flag unset) this is false, so test checkout is
// disabled there by construction.
export const isTestEnvReady = () =>
  process.env.PAYMENTS_TEST_MODE_ENABLED === "true" &&
  !!process.env.RAZORPAY_TEST_KEY_ID &&
  !!process.env.RAZORPAY_TEST_KEY_SECRET;

// Live Razorpay readiness (booleans only, no secrets).
export const isLiveEnvReady = () =>
  !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

/**
 * Decide if a NEW payment may be initiated for this request.
 * Returns { allowed, mode, reason, keys? }.
 *   mode: "live" | "test" | "blocked"
 * Fails closed on any error.
 */
export const resolvePaymentDecision = async (user) => {
  let settings;
  try {
    settings = await getPaymentSettings();
  } catch (e) {
    // DB unreachable → fail closed.
    return { allowed: false, mode: "blocked", reason: "SETTINGS_UNAVAILABLE" };
  }

  // Maintenance OFF → ordinary live payments (existing per-request checks still
  // apply downstream). Still require live keys to actually be present.
  if (settings.paymentMaintenance === false) {
    if (!isLiveEnvReady()) {
      return { allowed: false, mode: "blocked", reason: "LIVE_NOT_CONFIGURED" };
    }
    return {
      allowed: true,
      mode: "live",
      reason: "OK",
      keys: { key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET },
    };
  }

  // Maintenance ON → only the authorized test account, and only with a safely
  // isolated test environment, may proceed (in TEST mode).
  if (isAuthorizedTestUser(user) && isTestEnvReady()) {
    return {
      allowed: true,
      mode: "test",
      reason: "TEST_SANDBOX",
      keys: { key_id: process.env.RAZORPAY_TEST_KEY_ID, key_secret: process.env.RAZORPAY_TEST_KEY_SECRET },
    };
  }

  // Everyone else is blocked.
  return { allowed: false, mode: "blocked", reason: "PAYMENTS_UNAVAILABLE" };
};

// Pick the Razorpay secret to VERIFY a callback for an existing booking, based
// on the mode that booking's order was created in. Reconciling an in-flight
// live payment must use the live secret; a test booking uses the test secret.
export const secretForMode = (mode) =>
  mode === "test" ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_KEY_SECRET;

// Full key pair for a given mode — used e.g. for a balance top-up, which must
// reuse the mode its parent booking was created in.
export const keysForMode = (mode) =>
  mode === "test"
    ? { key_id: process.env.RAZORPAY_TEST_KEY_ID, key_secret: process.env.RAZORPAY_TEST_KEY_SECRET }
    : { key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET };

// Diagnostics for the admin panel — booleans + state only, never secrets.
export const buildDiagnostics = (settings) => ({
  paymentMaintenance: settings.paymentMaintenance,
  updatedAt: settings.updatedAt,
  updatedByEmail: settings.updatedByEmail || "",
  whatsappConfigured: !!(settings.whatsappNumber && settings.whatsappNumber.trim()),
  liveReady: isLiveEnvReady(),
  testSandboxReady: isTestEnvReady(),
  authorizedTestEmail: AUTHORIZED_TEST_EMAIL,
});
