import passport from "passport";

/**
 * isAdmin — authorization middleware for admin-only endpoints.
 * 1. Verifies the JWT (via the existing passport "jwt" strategy).
 * 2. Confirms the authenticated user has role === "Admin".
 *
 * Used to protect sensitive endpoints (full user list, user deletion)
 * that previously had no authentication. Public read routes remain open.
 */
export const isAdmin = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err) {
      return res.status(500).json({ message: "Authentication error" });
    }
    if (!user) {
      return res
        .status(401)
        .json({ message: "Unauthorized — please log in as an admin" });
    }
    if (user.role !== "Admin") {
      return res
        .status(403)
        .json({ message: "Forbidden — admin access required" });
    }
    req.user = user;
    return next();
  })(req, res, next);
};
