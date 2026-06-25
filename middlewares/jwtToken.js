import jwt from "jsonwebtoken";

const { APP_SECRET } = process.env;

export const logIn = (user) =>
  new Promise((resolve, reject) => {
    // Sign only the minimum needed to identify the user — never the whole
    // user doc (avoids leaking hashes/tokens) — and always set an expiry.
    const payload = { _id: user?._id, role: user?.role };
    jwt.sign(payload, APP_SECRET, { expiresIn: "7d" }, (error, token) => {
      if (!error) {
        resolve(`Bearer ${token}`);
      } else {
        reject(error);
      }
    });
  });
