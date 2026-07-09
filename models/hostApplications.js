import mongoose from "mongoose";

/* Host applications from the public "Become a Host" form. Separate from the
 * generic Enquire collection and from the Host record itself (which admin
 * creates on approval). Fully additive — no existing model touched. */
const hostApplicationSchema = mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: false },
    city: { type: String, required: false },
    category: { type: String, required: false },
    about: { type: String, required: false },
    years: { type: String, required: false },
    groupSize: { type: String, required: false },
    website: { type: String, required: false },
    userId: { type: String, required: false },
    // new | reviewing | approved | rejected | converted (Host created)
    status: { type: String, default: "new" },
    adminNote: { type: String, default: "" },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "Host", required: false },
  },
  { timestamps: true }
);

export const HostApplication = mongoose.model("HostApplication", hostApplicationSchema);
