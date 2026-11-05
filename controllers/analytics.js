import { Bookings, Enquire, User, Trips } from "../models/index.js";

/**
 * Reconstruct the grand total of a booking from its cardData blob.
 * grand = sum(cardSectionData price * qty) + gstTax - discount
 */
const grandTotal = (booking) => {
  let cd = booking?.cardData;
  if (typeof cd === "string") {
    try {
      cd = JSON.parse(cd);
    } catch {
      cd = {};
    }
  }
  cd = cd || {};
  const base = Array.isArray(cd.cardSectionData)
    ? cd.cardSectionData.reduce(
        (s, it) =>
          s + (Number(it?.TitlePrice) || 0) * (Number(it?.quantity) || 0),
        0
      )
    : 0;
  const gst = Number(cd.gstTax) || 0;
  const discount = Number(booking?.coupenDiscount) || 0;
  return base + gst - discount;
};

const tripName = (booking) => {
  let pd = booking?.paymentDetail;
  if (typeof pd === "string") {
    try {
      pd = JSON.parse(pd);
    } catch {
      pd = {};
    }
  }
  return pd?.title || "Unknown Trip";
};

const dayKey = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10); // YYYY-MM-DD
};

// A booking counts toward revenue/KPIs only if it was actually PAID (full or
// partial advance) and is NOT a test-sandbox booking. "created" (unpaid /
// abandoned), failed and mode:"test" never count as captured revenue.
export const isEligibleBooking = (b) =>
  (b?.paymentStatus === "fullPayment" || b?.paymentStatus === "firstPayment") &&
  b?.mode !== "test";

// Created-but-unpaid (abandoned checkout), excluding test. Reported separately.
export const isAbandonedBooking = (b) =>
  b?.paymentStatus === "created" && b?.mode !== "test";

/**
 * GET /api/analytics/overview?from=ISO&to=ISO
 * Returns KPIs, time series, payments split, top trips, funnel, recent.
 * Revenue/KPIs count only PAID, non-test bookings (see isEligibleBooking).
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const now = new Date();
    const to = req.query.to ? new Date(req.query.to) : now;
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30d

    // In-range bookings (by DateOfBooking; fall back to _id timestamp).
    const allBookings = await Bookings.find().lean();
    const inRange = allBookings.filter((b) => {
      const d = b.DateOfBooking ? new Date(b.DateOfBooking) : b._id.getTimestamp();
      return d >= from && d <= to;
    });

    // Only PAID, non-test bookings drive revenue/KPIs. Abandoned (created/unpaid)
    // are counted separately, never as revenue.
    const bookings = inRange.filter(isEligibleBooking);
    const abandonedCount = inRange.filter(isAbandonedBooking).length;

    // KPIs
    let totalSales = 0;      // captured revenue (advance counts as captured)
    let totalPending = 0;    // outstanding balance on partial bookings only
    let fullPaidCount = 0;
    let partialCount = 0;
    const tripAgg = {}; // tripId -> { name, bookings, revenue }
    const dailyAgg = {}; // YYYY-MM-DD -> { revenue, bookings }

    bookings.forEach((b) => {
      const paid = Number(b.total) || 0;
      totalSales += paid;

      // Partial (firstPayment) carries an outstanding balance; full does not.
      if (b.paymentStatus === "firstPayment") {
        const pending = grandTotal(b) - paid;
        if (pending > 0) { totalPending += pending; partialCount += 1; }
        else fullPaidCount += 1;
      } else {
        fullPaidCount += 1;
      }

      const name = tripName(b);
      const key = b.tripId || name;
      if (!tripAgg[key]) tripAgg[key] = { name, bookings: 0, revenue: 0 };
      tripAgg[key].bookings += 1;
      tripAgg[key].revenue += paid;

      const dk = dayKey(b.DateOfBooking || b._id.getTimestamp());
      if (dk) {
        if (!dailyAgg[dk]) dailyAgg[dk] = { date: dk, revenue: 0, bookings: 0 };
        dailyAgg[dk].revenue += paid;
        dailyAgg[dk].bookings += 1;
      }
    });

    const bookingsCount = bookings.length;
    const avgBookingValue = bookingsCount ? Math.round(totalSales / bookingsCount) : 0;

    // Enquiries in range
    const allEnquiries = await Enquire.find().lean();
    const enquiries = allEnquiries.filter((e) => {
      const d = e.Date ? new Date(e.Date) : e._id.getTimestamp();
      return d >= from && d <= to;
    });
    const enquiriesCount = enquiries.length;

    // New users in range (by _id timestamp; exclude admins)
    const allUsers = await User.find().lean();
    const newUsers = allUsers.filter((u) => {
      if (u.role === "Admin") return false;
      const d = u._id.getTimestamp();
      return d >= from && d <= to;
    });
    const newUsersCount = newUsers.length;

    // Time series sorted by date
    const timeSeries = Object.values(dailyAgg).sort((a, b) =>
      a.date < b.date ? -1 : 1
    );

    // Top trips by revenue (top 5)
    const topTrips = Object.values(tripAgg)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Funnel: enquiries -> bookings -> paid (full)
    const funnel = {
      enquiries: enquiriesCount,
      bookings: bookingsCount,
      paid: fullPaidCount,
      conversion: enquiriesCount
        ? Math.round((bookingsCount / enquiriesCount) * 100)
        : 0,
    };

    // Recent bookings (latest 5 in range)
    const recent = [...bookings]
      .sort((a, b) => {
        const da = new Date(a.DateOfBooking || a._id.getTimestamp());
        const db = new Date(b.DateOfBooking || b._id.getTimestamp());
        return db - da;
      })
      .slice(0, 5)
      .map((b) => {
        const paid = Number(b.total) || 0;
        const pending = grandTotal(b) - paid;
        return {
          user: b.userName || "—",
          trip: tripName(b),
          amount: paid,
          status: pending > 0 ? "Partial" : "Booked",
          date: b.DateOfBooking || b._id.getTimestamp(),
        };
      });

    return res.status(200).json({
      success: true,
      range: { from, to },
      kpis: {
        totalSales,
        totalPending,
        bookings: bookingsCount,
        abandoned: abandonedCount, // created/unpaid, excluded from revenue
        newUsers: newUsersCount,
        enquiries: enquiriesCount,
        avgBookingValue,
      },
      paymentsSplit: { fullPaid: fullPaidCount, partial: partialCount },
      timeSeries,
      topTrips,
      funnel,
      recent,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
