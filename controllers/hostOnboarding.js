import crypto from "crypto";
import "dotenv/config";
import mongoose from "mongoose";
import { Resend } from "resend";
import { Host } from "../models/hosts.js";
import { HostApplication } from "../models/hostApplications.js";
import { uploadFilesToS3 } from "../middlewares/index.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const TTL_DAYS = Number(process.env.HOST_ONBOARDING_TTL_DAYS) || 14;
const CLIENT_URL = process.env.CLIENT_URL || "https://www.nomadictownies.com";

const parseJSON = (v, f) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } };

// ── Generate + email the onboarding link. Called from updateApplication when
// an application is approved. Best-effort email; never breaks the approval. ──
export const issueOnboardingLink = async (app) => {
  if (!app) return null;
  const token = crypto.randomBytes(32).toString("hex");
  app.onboardingToken = token;
  app.onboardingTokenExpiry = new Date(Date.now() + TTL_DAYS * 864e5);
  app.onboardingUsed = false;
  await app.save();

  const link = `${CLIENT_URL}/host-onboarding/${token}`;
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: process.env.MAIL_FROM || "Nomadic Townies <noreply@nomadictownies.com>",
        to: app.email,
        subject: "You're approved — complete your Nomadic Townies host profile",
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#221C17">
            <h2 style="color:#CF4A2C">Welcome aboard${app.fullName ? `, ${app.fullName.split(" ")[0]}` : ""}!</h2>
            <p>Your application to host with <strong>Nomadic Townies</strong> has been approved. The last step is to complete your host profile.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#CF4A2C;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;display:inline-block">Complete your profile →</a>
            </p>
            <p style="font-size:13px;color:#726A5E">This secure link is unique to you and expires in ${TTL_DAYS} days. Our team reviews every profile before it goes live.</p>
          </div>`,
      });
    }
  } catch (e) {
    console.error("onboarding email failed:", e?.message || e);
  }
  return { token, link };
};

// Validate a token → app (not expired, not used). Returns app or null.
const resolveToken = async (token) => {
  if (!token) return null;
  const app = await HostApplication.findOne({ onboardingToken: token });
  if (!app) return null;
  if (app.onboardingUsed) return { app, error: "used" };
  if (app.onboardingTokenExpiry && app.onboardingTokenExpiry < new Date()) return { app, error: "expired" };
  // Onboarding is unlocked once an admin moves the application to "reviewing"
  // (or later approved). Before that the link isn't active.
  const st = String(app.status).toLowerCase();
  if (st !== "reviewing" && st !== "approved") return { app, error: "not_approved" };
  return { app, error: null };
};

// GET /host-onboarding/:token — public (token IS the auth). Returns prefill so
// the form can pre-populate name/email/phone/city from the application.
export const getOnboarding = async (req, res) => {
  const r = await resolveToken(req.params.token);
  if (!r) return res.status(404).json({ ok: false, error: "invalid" });
  if (r.error) return res.status(410).json({ ok: false, error: r.error });
  const a = r.app;
  return res.json({
    ok: true,
    prefill: {
      hostName: a.fullName || "",
      email: a.email || "",
      phone: a.mobile || "",
      city: a.city || "",
      overview: a.about || "",
      foundedYear: a.years || "",
      groupSize: a.groupSize || "",
      website: a.website || "",
      categories: a.category ? [a.category] : [],
    },
  });
};

// POST /host-onboarding/:token — public (token auth). Multipart. Creates a
// DRAFT Host (status:"draft", not live, no dashboard) and marks the token used.
const UPLOAD_FIELDS = [
  { name: "logo", maxCount: 1 }, { name: "cover", maxCount: 1 },
  { name: "gallery", maxCount: 10 },
  { name: "docPan", maxCount: 1 }, { name: "docId", maxCount: 2 },
  { name: "docBank", maxCount: 1 }, { name: "docGst", maxCount: 1 },
  { name: "docBiz", maxCount: 1 }, { name: "docCert", maxCount: 5 },
  { name: "docIns", maxCount: 2 },
];

export const submitOnboarding = (req, res) => {
  uploadFilesToS3(UPLOAD_FIELDS)(req, res, async () => {
    try {
      const r = await resolveToken(req.params.token);
      if (!r) return res.status(404).json({ ok: false, error: "invalid" });
      if (r.error) return res.status(410).json({ ok: false, error: r.error });
      const app = r.app;

      const b = req.body || {};
      const f = req.uploadedFiles || {};
      const url1 = (k) => f[k]?.[0]?.url || undefined;
      const urls = (k) => (f[k] || []).map((x) => x.url);

      // Draft host — every onboarding field mapped 1:1 to the Host schema.
      const doc = {
        source: "onboarding",
        status: "draft",
        isActive: false, showOnWebsite: false, dashboardAccess: false,
        // basic
        hostName: b.hostName, displayName: b.displayName,
        // emailAddress + panNumber carry unique indexes — never store "" (an
        // empty string collides across drafts); use undefined so the index skips.
        emailAddress: (b.email || "").trim().toLowerCase() || undefined,
        phoneNumber: b.phone, city: b.city, state: b.state, hqLocation: b.location,
        country: b.country, languages: parseJSON(b.languages, []),
        // about
        hostOverview: b.overview, shortBio: b.shortBio, whyHost: b.whyHost, uniqueValue: b.unique,
        // business
        hostTitle: b.brandName, foundedYear: b.foundedYear, businessType: b.bizType,
        gstNumber: b.gstNumber, panNumber: (b.panNumber || "").trim() || undefined,
        completeAddress: b.bizAddress || b.completeAddress,
        // branding + images
        tagline: b.tagline, brandingLogo: url1("logo"), coverImage: url1("cover"), gallery: urls("gallery"),
        // expertise
        specialties: [...parseJSON(b.categories, []), ...parseJSON(b.expertise, [])].filter(Boolean),
        regionsHosted: parseJSON(b.regions, []),
        experience: b.experience,
        achievements: [...parseJSON(b.certifications, []), ...parseJSON(b.achievements, [])].filter(Boolean),
        // badges
        verificationBadges: parseJSON(b.badges, []),
        // trust & service quality
        serviceQuality: {
          groupSize: b.groupSize, duration: b.duration, difficulty: b.difficulty,
          ageGroups: parseJSON(b.ageGroups, []), medical: b.medical,
        },
        // contact
        whatsapp: b.whatsapp, altPhone: b.altPhone,
        emergencyContact: { name: b.contactName, role: b.contactRole, phone: b.emergency },
        socialMedia: parseJSON(b.socialMedia, undefined),
        // bank (primary + extras)
        accountHolderName: b.accountHolderName, bankName: b.bankName,
        accountNumber: b.accountNumber, ifscCode: b.ifscCode,
        bankAccounts: parseJSON(b.bankAccounts, []),
        // documents
        documents: {
          panCard: url1("docPan"), idProof: url1("docId"), bankPassbook: url1("docBank"),
          gstCertificate: url1("docGst"), businessLicense: url1("docBiz"),
          certificates: urls("docCert"), insurance: urls("docIns"),
        },
        // Only link a real User ref; a stray/invalid id would CastError the write.
        user: mongoose.isValidObjectId(app.userId) ? app.userId : undefined,
      };

      // Resolve the target draft idempotently so retries never duplicate or
      // collide on the unique email/PAN indexes:
      //  1) the app already spawned a draft  → update it
      //  2) a host with this email exists     → reuse if it's an onboarding
      //     draft, else it's a live host → tell the user the email is in use
      //  3) otherwise create fresh
      let host;
      if (app.hostId) {
        host = await Host.findByIdAndUpdate(app.hostId, doc, { new: true });
      }
      if (!host && doc.emailAddress) {
        const existing = await Host.findOne({ emailAddress: doc.emailAddress });
        if (existing) {
          if (existing.source === "onboarding" || existing.status === "draft") {
            host = await Host.findByIdAndUpdate(existing._id, doc, { new: true });
          } else {
            return res.status(409).json({ ok: false, error: "email_in_use" });
          }
        }
      }
      if (!host) host = await Host.create(doc);

      app.hostId = host._id;
      app.onboardingUsed = true; // single-use link
      await app.save();

      return res.json({ ok: true, message: "Profile submitted for review", hostId: host._id });
    } catch (e) {
      console.error("submitOnboarding error:", e?.message || e);
      // Surface the actual cause so the applicant gets an actionable message.
      if (e?.code === 11000) {
        const dupField = Object.keys(e?.keyPattern || {})[0] || "detail";
        const map = { emailAddress: "email_in_use", panNumber: "pan_in_use" };
        return res.status(409).json({ ok: false, error: map[dupField] || "duplicate" });
      }
      if (e?.name === "ValidationError") {
        return res.status(400).json({ ok: false, error: "validation", detail: e.message });
      }
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
};
