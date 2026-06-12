import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/index.js';
import 'dotenv/config';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://api.nomadictownies.com/api/auth/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (user) return done(null, user);
    user = await User.findOne({ email: profile.emails[0].value });
    if (user) {
      user.googleId = profile.id;
      await user.save();
      return done(null, user);
    }
    user = await User.create({
      name: profile.displayName,
      email: profile.emails[0].value,
      googleId: profile.id,
      isVerified: true,
      profileImage: profile.photos[0] ? profile.photos[0].value : '',
    });
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

export default passport;
