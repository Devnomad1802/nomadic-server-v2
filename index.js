import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import authRoutes from "./routes/users.js";
import passport from "passport";
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

const app = express();
const { PORT } = process.env;

// Increased limits to support large file uploads (videos up to 500MB)
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));
app.use(express.static("public"));

app.use(cors());
app.use(passport.initialize());
passportMiddleware(passport);

//---------------serverFolder----------
app.use("/uploads", express.static("uploads"));


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
