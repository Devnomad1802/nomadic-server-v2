import mongoose from "mongoose";

/**
 * FormDraft — per-admin saved state of an in-progress Admin form (Add/Edit
 * Host, and reusable for other admin forms later). Stores only the serialisable
 * form fields as a JSON blob; file uploads are re-attached at final submit.
 *
 * A draft is NEVER a live record — saving a draft creates no Host/Trip/etc, so
 * it can never appear on the public site, activate a dashboard, or send emails.
 * Scoped to the owning admin (`user`). `(user, formType, refId)` is unique so a
 * given form (a new host, or the edit of one specific host) has exactly one
 * draft that Save overwrites.
 */
const formDraftSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    formType: { type: String, required: true }, // e.g. "host", "trip"
    refId: { type: String, default: null }, // entity id when drafting an EDIT; null for a NEW record
    label: { type: String, default: "" }, // human label for the drafts list (e.g. host name)
    data: { type: mongoose.Schema.Types.Mixed, default: {} }, // serialisable form state
  },
  { timestamps: true, minimize: false }
);

formDraftSchema.index({ user: 1, formType: 1, refId: 1 }, { unique: true });

export const FormDraft = mongoose.model("FormDraft", formDraftSchema);
