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
// Field names mirror the new onboarding design (which mirrors Add New Host).
const UPLOAD_FIELDS = [
  { name: "logo", maxCount: 1 }, { name: "coverImage", maxCount: 1 },
  { name: "gallery", maxCount: 10 },
  { name: "panCard", maxCount: 1 }, { name: "gstCertificate", maxCount: 1 },
  { name: "bankPassbook", maxCount: 1 }, { name: "businessLicense", maxCount: 1 },
  { name: "idProof", maxCount: 1 }, { name: "certificationsLicenses", maxCount: 5 },
  { name: "insuranceDocuments", maxCount: 2 },
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

      // Draft host — field ids from the onboarding form ARE the Host keys, so
      // this is a near-identity mapping (a few nested groups aside).
      const doc = {
        source: "onboarding",
        status: "draft",
        isActive: false, showOnWebsite: false, dashboardAccess: false,
        // basic
        hostName: b.hostName, location: b.location, city: b.city, state: b.state,
        pincode: b.pincode, completeAddress: b.completeAddress,
        // business — emailAddress + panNumber carry unique indexes; never store
        // "" (collides across drafts) → undefined so the index skips.
        panNumber: (b.panNumber || "").trim() || undefined, gstNumber: b.gstNumber,
        // bank
        bankName: b.bankName, accountHolderName: b.accountHolderName,
        accountNumber: b.accountNumber, ifscCode: b.ifscCode,
        // branding + images
        hostTitle: b.hostTitle, tagline: b.tagline,
        brandingLogo: url1("logo"), coverImage: url1("coverImage"), gallery: urls("gallery"),
        // about
        shortBio: b.shortBio, hostOverview: b.hostOverview, foundedYear: b.foundedYear,
        experience: b.experience, hqLocation: b.hqLocation,
        achievements: parseJSON(b.achievements, []),
        // specialties & expertise (chips → arrays)
        specialties: parseJSON(b.specialties, []),
        languages: parseJSON(b.languages, []),
        // faq + badges
        faqs: parseJSON(b.faqs, []),
        verificationBadges: parseJSON(b.badges, []),
        // trust & service quality (host-editable subset; stats set by admin)
        responseTimeLabel: b.responseTimeLabel,
        regionsHosted: parseJSON(b.regionsHosted, []),
        serviceQuality: {
          groupSize: b.maxGroupSize, duration: b.typicalDuration,
          difficulty: b.difficultyLevels, ageGroups: parseJSON(b.ageGroups, []),
          medical: b.firstAidOnTrips,
        },
        // contact
        emailAddress: (b.email || "").trim().toLowerCase() || undefined,
        phoneNumber: b.phone, whatsapp: b.whatsapp, supportHours: b.supportHours,
        // host onboarding details
        displayName: b.displayName, country: b.country, businessType: b.businessType,
        whyHost: b.whyHost, uniqueValue: b.uniqueValue, altPhone: b.alternatePhone,
        emergencyContact: {
          name: b.emergencyContactName, role: b.emergencyContactRole, phone: b.emergencyPreparedness,
        },
        // documents
        documents: {
          panCard: url1("panCard"), gstCertificate: url1("gstCertificate"),
          bankPassbook: url1("bankPassbook"), businessLicense: url1("businessLicense"),
          idProof: url1("idProof"), certificates: urls("certificationsLicenses"),
          insurance: urls("insuranceDocuments"),
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
