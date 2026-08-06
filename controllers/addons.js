import { Addon } from "../models/addons.js";
import { Trips } from "../models/trips.js";

// Does an add-on's scope allow this trip? Empty scope = global. A populated
// filter must match; fields are ANDed, values within a field are ORed.
const scopeAllows = (addon, ctx) => {
  const s = addon.scope || {};
  const anyEmpty = (arr) => !Array.isArray(arr) || arr.length === 0;
  const hit = (arr, vals) => arr.some((x) => vals.map((v) => `${v}`.toLowerCase()).includes(`${x}`.toLowerCase()));
  if (!anyEmpty(s.tripIds) && !s.tripIds.map(String).includes(`${ctx.tripId}`)) return false;
  if (!anyEmpty(s.categories) && !hit(s.categories, ctx.categories)) return false;
  if (!anyEmpty(s.regions) && !hit(s.regions, ctx.regions)) return false;
  if (!anyEmpty(s.countries) && !hit(s.countries, ctx.countries)) return false;
  return true;
};

const parseCats = (v) => {
  try { const a = typeof v === "string" ? JSON.parse(v) : v; return (Array.isArray(a) ? a : [a]).flat().map((x) => `${x}`.replace(/[[\]"]/g, "").trim()).filter(Boolean); }
  catch { return `${v || ""}`.split(",").map((x) => x.trim()).filter(Boolean); }
};

// GET /addons?tripId= — public. Returns the active, in-scope add-on catalogue
// for a trip. The client renders these; it never sees or sends prices as truth.
export const listAddons = async (req, res) => {
  const { tripId } = req.query;
  let ctx = { tripId, categories: [], regions: [], countries: [] };
  if (tripId) {
    const trip = await Trips.findById(tripId).select("categories location").lean().catch(() => null);
    if (trip) ctx = { tripId, categories: parseCats(trip.categories), regions: parseCats(trip.location), countries: [] };
  }
  const all = await Addon.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const addons = all.filter((a) => scopeAllows(a, ctx));
  return res.json({ ok: true, data: addons });
};

// Server-trusted pricing. Given the user's chosen [{addonId, planId}], look up
// the real plan prices from the catalogue and return the verified total + a
// normalized snapshot to persist on the booking. Unknown/inactive/out-of-scope
// ids are ignored (never trusted), so a crafted request can't under/over-charge.
export const priceSelectedAddons = async (selected, ctx) => {
  const list = Array.isArray(selected) ? selected : [];
  if (!list.length) return { total: 0, items: [] };
  const ids = list.map((s) => s?.addonId).filter(Boolean);
  const addons = await Addon.find({ _id: { $in: ids }, active: true }).lean().catch(() => []);
  const byId = new Map(addons.map((a) => [`${a._id}`, a]));
  const items = [];
  let total = 0;
  for (const sel of list) {
    const a = byId.get(`${sel?.addonId}`);
    if (!a) continue;
    if (ctx && !scopeAllows(a, ctx)) continue;
    const plan = (a.plans || []).find((p) => p.planId === sel?.planId);
    if (!plan) continue;
    const price = Math.round(Number(plan.price) || 0);
    if (price <= 0) continue;
    total += price;
    items.push({
      addonId: `${a._id}`, type: a.type, title: a.title,
      provider: a.provider?.name || "", planId: plan.planId, planLabel: plan.label,
      price, status: "pending",
    });
  }
  return { total, items };
};

// POST /addons/seed — admin. Idempotent: seeds the first Travel Insurance
// add-on (3 plans) if none exists yet. Safe to run repeatedly.
export const seedAddons = async (req, res) => {
  if (String(req.user?.role).toLowerCase() !== "admin") {
    return res.status(403).json({ ok: false, error: "Admin only" });
  }
  const existing = await Addon.findOne({ type: "insurance" });
  if (existing) return res.json({ ok: true, seeded: false, message: "Insurance add-on already exists", id: existing._id });
  const doc = await Addon.create({
    type: "insurance",
    title: "Protect your experience",
    tagline: "Travel with extra peace of mind.",
    icon: "shield",
    provider: { name: "Assure Travel", verified: true },
    features: ["Instant policy", "Easy claims", "Secure purchase"],
    scope: {}, // global — available on every trip for now
    selection: "single",
    availableUntilHoursBeforeDeparture: 48,
    sortOrder: 0,
    plans: [
      { planId: "standard", label: "Standard", summary: "Medical + baggage · ₹1L cover", price: 199, coverage: ["Medical emergencies", "Lost baggage", "₹1L cover"] },
      { planId: "adventure", label: "Adventure", summary: "+ trekking & high-altitude activities", price: 399, coverage: ["Everything in Standard", "Adventure activities", "High-altitude cover"] },
      { planId: "expedition", label: "Expedition", summary: "+ emergency evacuation · ₹5L cover", price: 699, coverage: ["Everything in Adventure", "Emergency evacuation", "₹5L cover"] },
    ],
  });
  return res.json({ ok: true, seeded: true, id: doc._id });
};
