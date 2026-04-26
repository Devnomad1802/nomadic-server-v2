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
  console.log("sendOtp", otp, phone);
  const params = {
    Message: `Your OTP is ${otp}`,
    PhoneNumber: phone, // Correct key name
  };

  return sns.publish(params).promise();
};
const otpStore = new Map(); // In-memory store for OTPs

export const storeOtp = (phone, otp) => {
  console.log("storeOtp", phone, otp);
  const ttl = 30 * 60 * 1000; // 30 minutes in milliseconds
  const expiration = Date.now() + ttl;
  otpStore.set(phone, { otp, expiration });
};

export const verifyOtp = (phone, otp) => {
  console.log("verifyOtp", phone, otp);

  const record = otpStore.get(phone);
  console.log("Record:", record);
  console.log("Received OTP:", otp);

  if (!record) {
    console.log("OTP not found");
    return { valid: false, message: "OTP not found" };
  }

  const { otp: storedOtp, expiration } = record;
  console.log("Stored OTP:", storedOtp);
  console.log("Expiration:", expiration);
  console.log("Current Time:", Date.now());

  if (Date.now() > expiration) {
    console.log("OTP expired");
    otpStore.delete(phone);
    return { valid: false, message: "OTP expired" };
  }

  if (storedOtp !== otp) {
    console.log("Invalid OTP");
    return { valid: false, message: "Invalid OTP" };
  }

  otpStore.delete(phone);
  console.log("OTP verified successfully");
  return { valid: true, message: "OTP verified successfully" };
};
