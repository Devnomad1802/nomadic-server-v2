/* ------------------------------------------------------------------
 * STAGING ONLY — isolated, ephemeral backend for Host Dashboard testing.
 * Spins an in-memory MongoDB (no system install, no cloud, ZERO prod
 * impact), seeds a admin + host + sample trips (incl. one pending
 * proposal), then boots the real Express app against it.
 * Run: node staging-server.mjs   →   http://localhost:5000/api
 * Not committed / not pushed. Does NOT touch the live database.
 * ------------------------------------------------------------------ */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const mem = await MongoMemoryServer.create();
const uri = mem.getUri("nomadic_staging");

// Env must be set BEFORE importing the app (index.js reads these at import).
process.env.MONGO_URI = uri;
process.env.PORT = process.env.PORT || "5000";
process.env.BCRYPT_WORK_FACTOR = "10";
process.env.CLIENT_URL = "http://localhost:3002";
process.env.ADMIN_URL = "http://localhost:5173";
// Dummies so config/passport + aws config don't throw on import.
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "staging-google-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "staging-google-secret";
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
// Twilio SDK is constructed at import of controllers/users.js — needs a
// well-formed (dummy) accountSid starting with "AC" or it throws.
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "ACstaging00000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "staging-twilio-token";
process.env.TWILIO_SMS_SERVICE = process.env.TWILIO_SMS_SERVICE || "staging";
process.env.VERIFICATION_SECRET = process.env.VERIFICATION_SECRET || "staging-verification-secret";
process.env.APP_SECRET = process.env.APP_SECRET || "staging-app-secret";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_staging";
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_staging";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "staging";
process.env.RAZORPAYX_ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER || "0000000000";

const { User } = await import("./models/user.js");
const { Host } = await import("./models/hosts.js");
const { Trips } = await import("./models/trips.js");
const { Bookings } = await import("./models/bookings.js");
const { Enquire } = await import("./models/enquire.js");

await mongoose.connect(uri);
console.log("STAGING Mongo (in-memory) ready:", uri);

// --- seed admin (password hashed by the User pre-save hook) ---
await new User({
  name: "Hashim",
  email: "hmtenten94@gmail.com",
  password: "Achu@786",
  role: "Admin",
  isVerified: true,
}).save();

// --- seed a HOST login user (dashboard sign-in) ---
const hostUser = await new User({
  name: "Desert Trails",
  email: "host@deserttrails.in",
  password: "Host@123",
  role: "Host",
  isVerified: true,
}).save();

// --- seed a host (linked to the login user via Host.user) ---
const host = await new Host({
  hostName: "Desert Trails",
  hostTitle: "Desert Trails Adventures",
  tagline: "Curating unforgettable desert experiences",
  emailAddress: "host@deserttrails.in",
  panNumber: "ABCDE1234F",
  isVerified: true,
  status: "approved",
  user: hostUser._id,
}).save();

// --- second host + user (cross-host isolation testing) ---
const otherUser = await new User({
  name: "Mountain Co",
  email: "host@mountainco.in",
  password: "Host@123",
  role: "Host",
  isVerified: true,
}).save();
const otherHost = await new Host({
  hostName: "Mountain Co",
  hostTitle: "Mountain Co Expeditions",
  emailAddress: "host@mountainco.in",
  panNumber: "XYZAB9876K",
  isVerified: true,
  status: "approved",
  user: otherUser._id,
}).save();
await Trips.create([{
  title: "Everest Base Camp Lite",
  price: "55000", days: "12", nights: "11", location: "Nepal",
  categories: ["TRIP"], host: otherHost._id, enableBooking: true, Status: "approved",
}]);

// --- seed trips: one legacy (no Status), one approved, one PENDING proposal ---
await Trips.create([
  {
    title: "Jaisalmer Desert Safari",
    price: "12500", days: "4", nights: "3", location: "Rajasthan, India",
    categories: ["TRIP"], host: host._id, enableBooking: true, // legacy: no Status
    cardImage: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=400",
  },
  {
    title: "Manali High Pass Trek",
    price: "18000", days: "7", nights: "6", location: "Himachal Pradesh",
    categories: ["BACKPACKING"], host: host._id, enableBooking: true, Status: "approved",
    cardImage: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400",
  },
  {
    title: "Spiti Valley Winter Expedition",
    price: "24000", days: "8", nights: "7", location: "Himachal Pradesh",
    categories: ["TRIP"], host: host._id, enableBooking: false, Status: "pending",
    cardImage: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=400",
  },
]);

// --- bookings + a linked enquiry on Desert Trails' first trip ---
const dtTrips = await Trips.find({ host: host._id });
await Bookings.create([
  {
    userId: "u-trav-1", bookingId: "NT-1001", tripId: String(dtTrips[0]._id),
    total: 25000, paymentStatus: "paid", status: "Confirmed", userName: "Amit Sharma",
    DateOfBooking: new Date("2026-06-20"),
    travellers: [{ name: "Amit Sharma", isLead: true }, { name: "Neha Sharma" }],
  },
  {
    userId: "u-trav-2", bookingId: "NT-1002", tripId: String(dtTrips[1]._id),
    total: 18000, paymentStatus: "partial", status: "Upcoming", userName: "Priya Kumar",
    DateOfBooking: new Date("2026-06-22"),
    travellers: [{ name: "Priya Kumar", isLead: true }],
  },
]);
await Enquire.create([{
  Name: "Arjun Desai", Email: "arjun@example.com", Message: "Are meals included in the trek?",
  status: "New", Date: new Date(), tripId: String(dtTrips[1]._id), hostId: String(host._id),
}]);

console.log("Seeded: admin, 2 hosts (+linked users), 4 trips (1 pending), 2 bookings, 1 enquiry.");
console.log("Booting Express app…");
await import("./index.js");
