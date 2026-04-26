import mongoose from "mongoose";
const { MONGO_URI } = process.env;
export function connectDB() {
  return new Promise((res, rej) => {
    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", true);
    mongoose
      .connect(MONGO_URI)
      .then(() => {
        console.log("DATABASE IS CONNECTED :)");
        res();
      })
      .catch(rej);
  });
}
