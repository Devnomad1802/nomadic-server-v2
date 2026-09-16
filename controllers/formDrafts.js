import { FormDraft } from "../models/formDrafts.js";

/**
 * Admin form drafts — owner-scoped CRUD. All routes are Admin-only and every
 * query is filtered by the authenticated admin's id, so one admin can never see
 * or touch another's drafts.
 */

const ownerId = (req) => req.user?._id;

// POST /api/form-drafts  { formType, refId?, label?, data }
// Upsert the single draft for (admin, formType, refId) — Save overwrites.
export const saveDraft = async (req, res) => {
  const { formType, refId = null, label = "", data = {} } = req.body || {};
  if (!formType) return res.status(400).json({ success: false, message: "formType is required" });

  const draft = await FormDraft.findOneAndUpdate(
    { user: ownerId(req), formType, refId: refId || null },
    { $set: { label, data }, $setOnInsert: { user: ownerId(req), formType, refId: refId || null } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return res.status(200).json({ success: true, data: draft });
};

// GET /api/form-drafts?formType=host   → the admin's drafts (newest first).
export const listDrafts = async (req, res) => {
  const filter = { user: ownerId(req) };
  if (req.query.formType) filter.formType = req.query.formType;
  const drafts = await FormDraft.find(filter).sort({ updatedAt: -1 }).lean();
  return res.status(200).json({ success: true, data: drafts });
};

// GET /api/form-drafts/:id  (owner only)
export const getDraft = async (req, res) => {
  const draft = await FormDraft.findOne({ _id: req.params.id, user: ownerId(req) }).lean();
  if (!draft) return res.status(404).json({ success: false, message: "Draft not found" });
  return res.status(200).json({ success: true, data: draft });
};

// DELETE /api/form-drafts/:id  (owner only). No live record is affected — a
// draft is just saved form state.
export const deleteDraft = async (req, res) => {
  const result = await FormDraft.deleteOne({ _id: req.params.id, user: ownerId(req) });
  if (!result.deletedCount) return res.status(404).json({ success: false, message: "Draft not found" });
  return res.status(200).json({ success: true, message: "Draft deleted" });
};
