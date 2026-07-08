import jwt from "jsonwebtoken";

const { APP_SECRET } = process.env;

export const logIn = (user) =>
  new Promise((resolve, reject) => {
    // Tokens now expire (7d). Legacy tokens without `exp` still verify, so
    // existing sessions are not force-logged-out.
    jwt.sign(user, APP_SECRET, { expiresIn: "7d" }, (error, token) => {
      if (!error) {
        resolve(`Bearer ${token}`);
      } else {
        reject(error);
      }
    });
  });
