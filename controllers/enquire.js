import crypto from "crypto";
import { Enquire } from "../models/index.js";
import { uploadFiles } from "../middlewares/index.js";
import moment from "moment";

// ── Booking-enquiry fallback (Phase B) ──
// Hardened, public endpoint for the checkout fallback: server-validated,
// deduped, persisted with status "new" BEFORE success is returned, admin-
// visible via the existing enquiries list. Rate-limited at the route.
const clean = (v, max) => `${v ?? ""}`.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pure: validate + normalise a booking-enquiry body. Returns { error } or { data }.
export const validateBookingEnquiry = (body = {}) => {
  const name = clean(body.Name, 80);
  const email = clean(body.Email, 120).toLowerCase();
  const phone = clean(body.Phone, 20);
  const message = clean(body.Message, 1000);
  const tripId = clean(body.tripId, 64);
  const tripName = clean(body.tripName, 160);
  const batchInfo = clean(body.batchInfo, 80);
  const partySize = Math.max(0, Math.min(99, parseInt(body.partySize, 10) || 0)) || undefined;

  if (name.length < 2) return { error: "Please enter your name." };
  if (!email && !phone) return { error: "Please provide an email or phone number." };
  if (email && !EMAIL_RE.test(email)) return { error: "Please enter a valid email." };
  if (phone && phone.replace(/\D/g, "").length < 7) return { error: "Please enter a valid phone number." };
  if (message.length < 3) return { error: "Please add a short message." };

  return { data: { name, email, phone, message, tripId, tripName, batchInfo, partySize } };
};

// Pure: stable dedupe hash for (contact|trip|message).
export const dedupeKeyFor = ({ email, phone, tripId, message }) =>
  crypto.createHash("sha1").update(`${email || phone}|${tripId}|${message}`).digest("hex").slice(0, 24);

export const createBookingEnquiry = async (req, res) => {
  try {
    const v = validateBookingEnquiry(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const { name, email, phone, message, tripId, tripName, batchInfo, partySize } = v.data;

    // Dedupe accidental double-submits: same contact + trip + message within 10 min.
    const dedupeKey = dedupeKeyFor({ email, phone, tripId, message });
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await Enquire.findOne({ dedupeKey, Date: { $gte: since } });
    if (existing) {
      return res.status(200).json({ ok: true, deduped: true, id: `${existing._id}` });
    }

    const doc = new Enquire({
      Name: name,
      Email: email || undefined,
      Phone: phone || undefined,
      Message: message,
      tripId: tripId || undefined,
      tripName: tripName || undefined,
      batchInfo: batchInfo || undefined,
      partySize,
      source: "booking_fallback",
      status: "new",
      dedupeKey,
      Date: new Date(),
      chat: [{ Message: message, MessageBy: "User", Date: new Date() }],
    });
    await doc.save(); // success is reported ONLY after durable persistence
    return res.status(201).json({ ok: true, id: `${doc._id}` });
  } catch (error) {
    console.error("createBookingEnquiry error:", error?.message || error);
    return res.status(500).json({ error: "Could not submit your enquiry. Please try again." });
  }
};

export const initateEnquery = async (req, res) => {
  try {
    const { Name, Phone, Email, Message, userId } = req.body;
    const user = await Enquire.findOne({ _id: req.body._id });
    if (user) {
      let message = [];
      message.push({
        Message: req.body.Message,
        MessageBy: "User",
        Date: new Date(new Date().toUTCString()),
      });
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $set: { Message: req.body.Message } },
        { new: true }
      );
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $push: { chat: message } },
        { new: true }
      );
      return res.status(200).json({ message: "updateed " });
    } else {
      const addTrip = new Enquire({
        userId,
        Name,
        Phone,
        Email,
        Message,
        chat: [
          {
            Message: req.body.Message,
            MessageBy: "User",
            Date: new Date(new Date().toUTCString()),
          },
        ],
        Date: new Date(new Date().toUTCString()),
      });

      await addTrip.save();
      return res
        .status(200)
        .json({ message: "Trip added successfully", data: addTrip });
    }
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const replyEnquery = async (req, res) => {
  try {
    const { Reply } = req.body;
    const user = await Enquire.findOne({ _id: req.body._id });
    if (user) {
      let message = [];
      message.push({
        Message: req.body.Reply,
        MessageBy: "Admin",
        Date: new Date(new Date().toUTCString()),
      });
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $set: { Reply: req.body.Reply } },
        { new: true }
      );
      await Enquire.updateOne(
        {
          _id: req.body._id,
        },
        { $push: { chat: message } },
        { new: true }
      );
      return res.status(200).json({ message: "updateed " });
    }
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const getAllEnquries = async (req, res) => {
  try {
    let query = {};
    const { range } = req.query;

    if (range === "7days") {
      query.Date = { $gte: moment().subtract(7, "days").toDate() };
    } else if (range === "30days") {
      query.Date = { $gte: moment().subtract(30, "days").toDate() };
    }
    const blog = await Enquire.find(query).sort({ Date: -1 });

    // Respond with the list of blog
    return res
      .status(200)
      .json({ message: "All blog retrieved successfully", data: blog });
  } catch (error) {
    // Handle errors
    console.error("Error retrieving trips:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const deleteEnqurie = async (req, res) => {
  try {
    const dBanner = await Enquire.findByIdAndDelete({ _id: req.body._id });
    if (!dBanner) {
      return res.status(400).send("NO DATA FOUND");
    }
    return res.status(200).send("DELETED");
  } catch (error) {
    console.error("Error adding trip:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
