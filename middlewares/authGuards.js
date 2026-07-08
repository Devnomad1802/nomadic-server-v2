import passport from "passport";

/* Reusable auth guards. `authenticate` verifies the JWT (passport-jwt,
 * already configured with APP_SECRET) and attaches req.user. `requireRole`
 * checks the authenticated user's role (case-insensitive). Additive — apply
 * only to routes that should be protected; GET/read routes stay public. */

export const authenticate = passport.authenticate("jwt", { session: false });

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    const allowed = roles.map((r) => r.toLowerCase());
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, message: "Insufficient permissions." });
    }
    return next();
  };

/** authenticate + role check in one, for concise route wiring. */
export const authRole = (...roles) => [authenticate, requireRole(...roles)];
