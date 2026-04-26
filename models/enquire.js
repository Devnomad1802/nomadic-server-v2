import mongoose from "mongoose";

const userSchema = mongoose.Schema({
  Phone: { type: String, required: false },
  Email: { type: String, required: false },
  Name: { type: String, required: false },
  Message: { type: String, required: false },
  Reply: { type: String, required: false },
  userId: { type: String, required: false },
  status: { type: String, required: false },
  Date: { type: Date, required: false },
  chat: [
    {
      MessageBy: {
        type: String,
        required: false,
      },
      Message: {
        type: String,
        required: false,
      },
      timeStamp: {
        type: Date,
        default: new Date(new Date().toUTCString()),
      },
    },
  ],
});

export const Enquire = mongoose.model("Enquire", userSchema);
