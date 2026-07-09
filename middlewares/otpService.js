import "dotenv/config";
import AWS from "aws-sdk";
import crypto from "crypto";
AWS.config.update({
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const sns = new AWS.SNS();

export const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString(); // Generates a 6-digit OTP
};

export const sendOtp = (phone, otp) => {
  // Never log OTP or phone (PII / OTP leakage to logs).
  const params = {
    Message: `Your OTP is ${otp}`,
    PhoneNumber: phone, // Correct key name
  };

  return sns.publish(params).promise();
};
// NOTE: in-memory store — does not survive restarts or scale across instances.
// For production multi-instance, move to Redis with TTL + per-phone attempt cap.
const otpStore = new Map();

export const storeOtp = (phone, otp) => {
  const ttl = 30 * 60 * 1000; // 30 minutes in milliseconds
  const expiration = Date.now() + ttl;
  otpStore.set(phone, { otp, expiration });
};

export const verifyOtp = (phone, otp) => {
  const record = otpStore.get(phone);

  if (!record) {
    return { valid: false, message: "OTP not found" };
  }

  const { otp: storedOtp, expiration } = record;

  if (Date.now() > expiration) {
    otpStore.delete(phone);
    return { valid: false, message: "OTP expired" };
  }

  if (storedOtp !== otp) {
    return { valid: false, message: "Invalid OTP" };
  }

  otpStore.delete(phone);
  return { valid: true, message: "OTP verified successfully" };
};
