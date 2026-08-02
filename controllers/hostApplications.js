import { HostApplication } from "../models/hostApplications.js";
import { issueOnboardingLink } from "./hostOnboarding.js";

// POST /host-portal/apply — PUBLIC. Stores a "Become a Host" application.
export const submitApplication = async (req, res) => {
  const { fullName, email, mobile, city, category, about, years, groupSize, website, userId } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ success: false, message: "Name and email are required." });
  }
  const app = await HostApplication.create({
    fullName, email, mobile, city, category, about, years, groupSize, website, userId,
  });
  return res.status(201).json({ success: true, message: "Application received.", data: { id: app._id } });
};

// GET /host-portal/applications — ADMIN. Lists applications (optional ?status=).
export const listApplications = async (req, res) => {
  if (String(req.user?.role).toLowerCase() !== "admin") {
    return res.status(403).json({ success: false, message: "Admin only." });
  }
  const filter = req.query.status ? { status: req.query.status } : {};
  const apps = await HostApplication.find(filter).sort({ createdAt: -1 }).limit(500);
  return res.status(200).json({ success: true, data: apps });
};

// PATCH /host-portal/applications/:id — ADMIN. Update status / note / link host.
export const updateApplication = async (req, res) => {
  if (String(req.user?.role).toLowerCase() !== "admin") {
    return res.status(403).json({ success: false, message: "Admin only." });
  }
  const { status, adminNote, hostId } = req.body;
  const update = {};
  if (status !== undefined) update.status = status;
  if (adminNote !== undefined) update.adminNote = adminNote;
  if (hostId !== undefined) update.hostId = hostId;
  const before = await HostApplication.findById(req.params.id);
  if (!before) return res.status(404).json({ success: false, message: "Application not found." });

  const app = await HostApplication.findByIdAndUpdate(req.params.id, update, { new: true });

  // Phase 1: on transition INTO approved, mint a secure onboarding link + email
  // it to the applicant. Additive — approval flow itself is unchanged. Skip if a
  // link was already issued (idempotent re-approve). Best-effort; never blocks.
  const nowApproved = String(app.status).toLowerCase() === "approved";
  const wasApproved = String(before.status).toLowerCase() === "approved";
  if (nowApproved && !wasApproved && !app.onboardingToken) {
    try { await issueOnboardingLink(app); } catch (e) { console.error("issueOnboardingLink:", e?.message || e); }
  }
  return res.status(200).json({ success: true, data: app });
};
