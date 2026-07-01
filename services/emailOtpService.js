import { Resend } from 'resend';
import crypto from 'crypto';
import 'dotenv/config';

const otpStore = new Map();
const resend = new Resend(process.env.RESEND_API_KEY);

// ---- Single source of truth for the email-OTP validity window ----
// Used for BOTH the store TTL and the email template, so the message can
// never disagree with the backend. Override with EMAIL_OTP_EXPIRY_MINUTES.
export const OTP_EXPIRY_MINUTES = Number(process.env.EMAIL_OTP_EXPIRY_MINUTES) || 10;

const expiryLabel = (minutes) => `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const generateEmailOtp = () => crypto.randomInt(100000, 999999).toString();

export const storeEmailOtp = (email, otp) => {
  const expiration = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
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

/**
 * Email-safe (table-based, inline-CSS, 600px single column) OTP template.
 * Renders in Gmail, Outlook (MSO) and Apple Mail. Matches the approved
 * Nomadic Townies OTP design. Variables: name, otp, expiry.
 */
export const buildOtpEmailHtml = ({ name, otp, expiry }) => {
  const safeName = escapeHtml(name && String(name).trim() ? String(name).trim() : 'there');
  const safeOtp = escapeHtml(otp);
  const safeExpiry = escapeHtml(expiry);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your Nomadic Townies verification code</title>
  <!--[if mso]><style type="text/css">body,table,td,h1,p,span,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Hanken+Grotesk:wght@400;600;700&display=swap');
    body{margin:0;padding:0;background:#EFE7DA;}
    a{text-decoration:none;}
    @media only screen and (max-width:600px){
      .nt-container{width:100% !important;}
      .nt-px{padding-left:24px !important;padding-right:24px !important;}
      .nt-otp{font-size:34px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#EFE7DA;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Your Nomadic Townies verification code — expires in ${safeExpiry}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFE7DA;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" class="nt-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFDF9;border-radius:18px;overflow:hidden;font-family:'Hanken Grotesk',Arial,Helvetica,sans-serif;">
          <!-- header band -->
          <tr>
            <td style="background:#221C17;padding:30px 34px;">
              <span style="font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:800;font-size:21px;letter-spacing:-0.01em;">
                <span style="color:#E9622F;">nomadic</span><span style="color:#F4EEE4;">&nbsp;townies</span>
              </span>
            </td>
          </tr>
          <!-- content -->
          <tr>
            <td class="nt-px" style="padding:34px 40px;">
              <span style="display:inline-block;padding:7px 14px;border-radius:99px;background:#F6E4DC;color:#CF4A2C;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">&#128274;&nbsp;Verify your email</span>
              <h1 style="margin:20px 0 0;font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:700;font-size:28px;line-height:1.15;letter-spacing:-0.02em;color:#221C17;">Hi <span style="color:#CF4A2C;">${safeName}</span>, let&rsquo;s confirm it&rsquo;s you</h1>
              <p style="margin:12px 0 0;font-size:16px;line-height:1.6;color:#5A5247;">Use the verification code below to finish signing in to your Nomadic Townies account. Enter it on the verification screen to continue.</p>
              <!-- OTP box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                <tr>
                  <td align="center" style="padding:26px 20px;background:#FBF6EE;border:1px solid #EAD9C9;border-radius:16px;">
                    <div style="font-weight:600;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#A89C8A;">Your verification code</div>
                    <div class="nt-otp" style="margin-top:14px;font-family:'Bricolage Grotesque',Arial,sans-serif;font-weight:700;font-size:44px;letter-spacing:0.22em;color:#221C17;">${safeOtp}</div>
                    <div style="margin-top:14px;font-weight:600;font-size:13px;color:#B5722A;">&#9201;&nbsp;Expires in ${safeExpiry}</div>
                  </td>
                </tr>
              </table>
              <!-- security notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:16px 18px;background:#FFFFFF;border:1px solid #EFE7DA;border-radius:13px;font-size:14px;line-height:1.55;color:#726A5E;">For your security, never share this code with anyone. Nomadic Townies will never ask you for your verification code by phone, email, or chat. If you didn&rsquo;t request this, you can safely ignore this email.</td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#8A8073;">Having trouble? Just request a new code from the verification screen.</p>
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:24px 34px;border-top:1px solid #EFE7DA;background:#FFFDF9;">
              <div style="font-weight:600;font-size:14px;color:#221C17;">Nomadic Townies</div>
              <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#9A9080;">Curated, host-led travel experiences.<br>This is an automated message — please do not reply directly.</p>
              <p style="margin:14px 0 0;">
                <a href="https://nomadictownies.com" style="font-weight:600;font-size:12px;color:#CF4A2C;">Help Center</a>&nbsp;&nbsp;&nbsp;
                <a href="https://nomadictownies.com/privacy-policy" style="font-weight:600;font-size:12px;color:#CF4A2C;">Privacy Policy</a>&nbsp;&nbsp;&nbsp;
                <a href="https://nomadictownies.com/terms-and-conditions" style="font-weight:600;font-size:12px;color:#CF4A2C;">Terms</a>
              </p>
              <p style="margin:14px 0 0;font-size:11px;line-height:1.5;color:#B8AE9E;">&copy; ${year} Nomadic Townies. Pune, Maharashtra, India.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const sendEmailOtp = async (email, otp, name) => {
  const expiry = expiryLabel(OTP_EXPIRY_MINUTES);
  await resend.emails.send({
    from: 'Nomadic Townies <noreply@nomadictownies.com>',
    to: email,
    subject: `Your Nomadic Townies verification code — expires in ${expiry}`,
    html: buildOtpEmailHtml({ name, otp, expiry }),
  });
};
