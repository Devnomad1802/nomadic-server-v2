import { resolvePaymentDecision } from "../services/paymentAvailability.js";

/**
 * paymentGate — mandatory server-side authorization for every endpoint that can
 * START a new Razorpay payment (order creation). Frontend hiding is not enough:
 * this blocks direct API calls, forged bodies, cached UI, and modified clients.
 *
 * Mount AFTER the auth middleware on authenticated payment routes so req.user is
 * available (needed to recognise the authorized test account). On unauthenticated
 * legacy routes it still runs and simply has no user → blocked while maintenance
 * is ON, which is the safe outcome.
 *
 * On allow, it stashes the resolved mode + Razorpay keys on the request so the
 * controller uses the correct (live or isolated-test) credentials:
 *   req.paymentMode = "live" | "test"
 *   req.rzpKeys     = { key_id, key_secret }
 *
 * Fails CLOSED: any error → 503, never an open payment window.
 */
export const paymentGate = async (req, res, next) => {
  try {
    const decision = await resolvePaymentDecision(req.user);
    if (!decision.allowed) {
      return res.status(503).json({
        error: {
          type: "PAYMENTS_UNAVAILABLE",
          message:
            "Online payments are temporarily unavailable. You can still explore trips and enquire on WhatsApp.",
        },
        code: decision.reason, // e.g. PAYMENTS_UNAVAILABLE | LIVE_NOT_CONFIGURED | SETTINGS_UNAVAILABLE
      });
    }
    req.paymentMode = decision.mode;
    req.rzpKeys = decision.keys;
    return next();
  } catch (e) {
    // Fail closed on any unexpected error.
    console.error("paymentGate error:", e?.message || e);
    return res.status(503).json({
      error: { type: "PAYMENTS_UNAVAILABLE", message: "Online payments are temporarily unavailable." },
      code: "GATE_ERROR",
    });
  }
};
