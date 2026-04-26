import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Sche = mongoose.Schema;

const { BCRYPT_WORK_FACTOR } = process.env;
const userSchema = mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,
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
