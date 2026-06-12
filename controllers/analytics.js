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

/**
 * GET /api/analytics/overview?from=ISO&to=ISO
 * Returns KPIs, time series, payments split, top trips, funnel, recent.
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const now = new Date();
    const to = req.query.to ? new Date(req.query.to) : now;
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30d

    // Bookings in range (by DateOfBooking; fall back to _id timestamp)
    const allBookings = await Bookings.find().lean();
    const bookings = allBookings.filter((b) => {
      const d = b.DateOfBooking ? new Date(b.DateOfBooking) : b._id.getTimestamp();
      return d >= from && d <= to;
    });

    // KPIs
    let totalSales = 0;
    let totalPending = 0;
    let fullPaidCount = 0;
    let partialCount = 0;
    const tripAgg = {}; // tripId -> { name, bookings, revenue }
    const dailyAgg = {}; // YYYY-MM-DD -> { revenue, bookings }

    bookings.forEach((b) => {
      const paid = Number(b.total) || 0;
      const grand = grandTotal(b);
      const pending = grand - paid > 0 ? grand - paid : 0;
      totalSales += paid;
      totalPending += pending;
      if (pending > 0) partialCount += 1;
      else fullPaidCount += 1;

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
