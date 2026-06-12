import { Resend } from 'resend';
import crypto from 'crypto';
import 'dotenv/config';

const otpStore = new Map();
const resend = new Resend(process.env.RESEND_API_KEY);

export const generateEmailOtp = () => crypto.randomInt(100000, 999999).toString();

export const storeEmailOtp = (email, otp) => {
  const expiration = Date.now() + 10 * 60 * 1000;
  otpStore.set(email, { otp, expiration });
};

export const verifyEmailOtp = (email, otp) => {
  const record = otpStore.get(email);
  if (!record) return { valid: false, message: 'OTP not found' };
  if (Date.now() > record.expiration) {
    otpStore.delete(email);
    return { valid: false, message: 'OTP expired' };
  }
  if (record.otp !== otp) return { valid: false, message: 'Invalid OTP' };
  otpStore.delete(email);
  return { valid: true, message: 'OTP verified successfully' };
};

export const sendEmailOtp = async (email, otp) => {
  await resend.emails.send({
    from: 'Nomadic Townies <noreply@nomadictownies.com>',
    to: email,
    subject: 'Your Nomadic Townies Login OTP',
    html: '<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:16px"><h2 style="color:#1F2937">Your OTP</h2><p style="color:#6B7280">Valid for 10 minutes.</p><div style="background:#FFF5F2;border:2px solid #CD482A;border-radius:12px;padding:24px;text-align:center"><span style="font-size:36px;font-weight:700;color:#CD482A;letter-spacing:8px">' + otp + '</span></div></div>',
  });
};
