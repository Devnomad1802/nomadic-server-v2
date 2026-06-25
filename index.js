import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/users.js";
import passport from "passport";
import "./config/passport.js";
import "dotenv/config";
import { connectDB } from "./database/db.js";
import { serverError, passportMiddleware } from "./middlewares/index.js";
import TipsRouts from "./routes/trips.js";
import BlogRouts from "./routes/blogs.js";
import VendorRouts from "./routes/vendors.js";
import BannerRouts from "./routes/banners.js";
import TeamMemberRouts from "./routes/teamMembers.js";
import ReviewRouts from "./routes/reviews.js";
import CategoryRouts from "./routes/categories.js";
import CouponRouts from "./routes/coupons.js";
import EnquireRouts from "./routes/enquire.js";
import OrderRoute from "./routes/Order.js";
import BookingRoute from "./routes/bookings.js";
import CoverImageRoute from "./routes/coverImages.js";
import HostRoutes from "./routes/hosts.js";
import PayoutRoutes from "./routes/payouts.js";
import UserReviewsRoutes from "./routes/UserReviews.js";
import SeoRoutes from "./routes/Seo.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();
const { PORT } = process.env;

// ── Security headers ──
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── CORS allow-list (prod domains + Vercel previews + local dev) ──
const corsAllow = (origin, cb) => {
  if (!origin) return cb(null, true); // server-to-server / curl
  const ok =
    /(^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)/.test(origin) ||
    /\.nomadictownies\.com$/.test(origin) ||
    /^https:\/\/nomadictownies\.com$/.test(origin) ||
    /\.vercel\.app$/.test(origin);
  return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
};
app.use(cors({ origin: corsAllow, credentials: true }));

// Body limits: generous for base64/image JSON, but not the old 500MB DoS surface.
// Large binary uploads go through multer (multipart), unaffected by this limit.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static("public"));

// ── NoSQL-injection sanitiser (strips $ and . from req body/params/query) ──
app.use(mongoSanitize());

app.use(passport.initialize());
passportMiddleware(passport);

//---------------serverFolder----------
app.use("/uploads", express.static("uploads"));

// ── Rate limiters on sensitive endpoints ──
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth", authLimiter);
app.use(["/api/order", "/api/validate"], orderLimiter);

//---------------- API ROUTES --------------------
app.use("/api/auth", authRoutes);

// ---------------- Trip Routs -------------------
app.use("/api", TipsRouts);
app.use("/api", BlogRouts);
app.use("/api", VendorRouts);
app.use("/api", BannerRouts);
app.use("/api", TeamMemberRouts);
app.use("/api", ReviewRouts);
app.use("/api", CategoryRouts);
app.use("/api", CouponRouts);
app.use("/api", EnquireRouts);
app.use("/api", OrderRoute);
app.use("/api", BookingRoute);
app.use("/api", CoverImageRoute);
app.use("/api/host", HostRoutes);
app.use("/api/razorpay", PayoutRoutes);
app.use("/api", UserReviewsRoutes);
app.use("/api", SeoRoutes);
app.use("/api/analytics", analyticsRoutes);


app.get("/", (req, res) => {
  res.status(404).json({ message: "No Such Route Exists!" });
});

// Error handling middleware must be registered before starting the server
app.use(serverError);

// Start server
app.listen(PORT, async () => {
  console.log(`Server Running On Port ${PORT}`);

  // Verify database connection on startup
  try {
    await connectDB();
    console.log("✅ Database connection established");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
  }
});
