import jwt from "jsonwebtoken";

const { APP_SECRET } = process.env;

export const logIn = (user) =>
  new Promise((resolve, reject) => {
    // const payload = user.toObject();
    jwt.sign(user, APP_SECRET, (error, token) => {
      if (!error) {
        resolve(`Bearer ${token}`);
      } else {
        reject(error);
      }
    });
  });
