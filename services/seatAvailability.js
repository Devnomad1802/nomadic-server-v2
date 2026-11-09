import { Bookings } from "../models/index.js";

// Bookings that legitimately consume batch inventory: a paid full booking, or a
// partial (firstPayment) deposit that holds the seat. "created" (unpaid /
// abandoned) and test-mode bookings never consume a seat.
export const SEAT_CONSUMING_STATUSES = ["fullPayment", "firstPayment"];

// occupied seats per batchIndex for ONE trip (sum of traveller quantities).
export const getBatchOccupancy = async (tripId) => {
  const rows = await Bookings.aggregate([
    {
      $match: {
        tripId: `${tripId}`,
        paymentStatus: { $in: SEAT_CONSUMING_STATUSES },
        mode: { $ne: "test" },
      },
    },
    { $group: { _id: "$batchIndex", occupied: { $sum: { $ifNull: ["$travellersCount", 1] } } } },
  ]);
  const map = {};
  rows.forEach((r) => { map[Number(r._id) || 0] = r.occupied; });
  return map;
};

// occupied seats for MANY trips at once: { tripId: { batchIndex: occupied } }.
export const getAllOccupancy = async () => {
  const rows = await Bookings.aggregate([
    { $match: { paymentStatus: { $in: SEAT_CONSUMING_STATUSES }, mode: { $ne: "test" } } },
    { $group: { _id: { tripId: "$tripId", batch: "$batchIndex" }, occupied: { $sum: { $ifNull: ["$travellersCount", 1] } } } },
  ]);
  const map = {};
  rows.forEach((r) => {
    const t = `${r._id.tripId}`;
    (map[t] = map[t] || {})[Number(r._id.batch) || 0] = r.occupied;
  });
  return map;
};

// Single source of truth for urgency labels (see spec §4).
// Few Seats Left takes precedence over Filling Fast.
export const seatUrgencyLabel = (capacity, occupied) => {
  const cap = Number(capacity) || 0;
  const occ = Number(occupied) || 0;
  if (cap <= 0) return "Sold Out";
  const remaining = Math.max(0, cap - occ);
  if (remaining === 0) return "Sold Out";
  if (remaining <= 2) return "Few Seats Left";
  if (occ > 5 && remaining > 2) return "Filling Fast";
  return null;
};

// Build the per-batch availability array from a trip's numberOfSeats (the
// stored CAPACITY per batch — never overwritten by remaining) + occupancy.
export const buildBatchAvailability = (numberOfSeatsRaw, occupancyMap = {}) => {
  let seats = [];
  try {
    seats = typeof numberOfSeatsRaw === "string"
      ? JSON.parse(numberOfSeatsRaw || "[]")
      : numberOfSeatsRaw || [];
  } catch { seats = []; }
  if (!Array.isArray(seats)) seats = [];
  return seats.map((s, i) => {
    const capacity = parseInt(s?.batchSeats, 10) || 0;
    const occupied = Number(occupancyMap[i]) || 0;
    const remaining = Math.max(0, capacity - occupied);
    return {
      batchIndex: i,
      capacity,
      occupied,
      remaining,
      soldOut: capacity > 0 && remaining <= 0,
      // overbooked data is surfaced, not hidden: remaining clamps at 0 but we flag it
      overbooked: occupied > capacity,
      label: seatUrgencyLabel(capacity, occupied),
    };
  });
};

// Attach `batchAvailability` to one lean trip object.
export const attachBatchAvailability = async (trip) => {
  if (!trip) return trip;
  const occ = await getBatchOccupancy(trip._id);
  trip.batchAvailability = buildBatchAvailability(trip.numberOfSeats, occ);
  return trip;
};
