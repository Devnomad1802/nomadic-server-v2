import { Types } from "mongoose";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { User } from "../models/index.js";
import "dotenv/config";
const { APP_SECRET } = process.env;
const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: APP_SECRET,
};
export const passportMiddleware = (passport) => {
  passport.use(
    new JwtStrategy(opts, (jwtPayload, done) => {
      // eslint-disable-next-line no-underscore-dangle
      const id = Types.ObjectId(jwtPayload._id);
      User.findById(id, (err, user) => {
        if (err) {
          console.log(err);
          return done(err, false);
        }
        if (user) {
          return done(null, user);
        } else {
          return done(null, false);
          // or you could create a new account
        }
      });
    })
  );
};
