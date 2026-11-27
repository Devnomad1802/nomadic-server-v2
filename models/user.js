import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Sche = mongoose.Schema;

const { BCRYPT_WORK_FACTOR } = process.env;
const userSchema = mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: { type: String, select: false },
  gender: String,
  role: String,
  influencer: String,
  verificationToken: String,
  isVerified: { type: Boolean, default: false },
  twoStepVerification: { type: Boolean, default: false },
  number: String,
  isLoggedIn: { type: Boolean, default: false },
  profileImage: String,
  bookmarks: [{ type: Sche.Types.ObjectId, ref: "Trips" }],
  googleId: String,

  // ── Admin-assisted customer provenance (additive, back-compat) ──
  // How this profile was created. Legacy/self-signup rows have no value.
  // "admin_assisted" = created by staff for an assisted booking; such a
  // profile is pending-activation (isVerified stays false — admin entering an
  // email does NOT verify ownership) and has no password set here.
  createdVia: { type: String, required: false },
  createdBy: { type: Sche.Types.ObjectId, ref: "User", required: false }, // admin actor (audit)
  consentGiven: { type: Boolean, required: false }, // admin attests the customer authorised this
  consentAt: { type: Date, required: false },
});
userSchema.pre("save", function () {
  if (this.isModified("password")) {
    // Number use to convert string to a number because we store a BCRYPT_WORK_FACTOR string in .env file
    this.password = bcrypt.hashSync(this.password, Number(BCRYPT_WORK_FACTOR));
  }
});

userSchema.methods.matchesPassword = function (password) {
  return bcrypt.compareSync(password, this.password);
};
export const User = mongoose.model("User", userSchema);
