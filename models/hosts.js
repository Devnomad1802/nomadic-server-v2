import mongoose from "mongoose";

const hostSchema = mongoose.Schema(
  {
    // Basic Information
    hostName: String,
    location: String,
    city: String,
    state: String,
    pincode: String,
    completeAddress: String,

    // Business Information
    panNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // allow many hosts without a PAN (only enforce uniqueness when present)
    },
    gstNumber: String,

    // Bank Account Details
    bankName: String,
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,

    // Branding
    hostTitle: String,
    tagline: String,
    brandingLogo: String,
    coverImage: String,

    // About
    hostOverview: String,
    shortBio: String, // short card description for the Meet Our Hosts directory
    foundedYear: String,
    experience: String,

    hqLocation: String,
    achievements: [String],
    gallery: [String],

    // Host reels — short vertical (9:16) videos the host owns, uploaded by the
    // admin and served from our own S3/CDN so the gallery can autoplay them
    // natively (muted, looped, playsinline) with no third-party player.
    //   videoUrl : S3 URL of the mp4 (required)
    //   poster   : S3 URL of a still frame (optional; avoids first-frame flash)
    //   sourceUrl: optional reference to the original Instagram reel (NOT shown
    //              to users — kept only for the admin's own bookkeeping)
    // Ordered (admin reorders).
    reels: [
      {
        videoUrl: String,
        poster: String,
        sourceUrl: String,
      },
    ],

    // Specialties & Expertise - Array of strings
    specialties: [String],

    // Languages the host speaks - Array of strings
    languages: [String],

    // Trust & Service Quality
    isVerified: {
      type: Boolean,
      default: false,
    },

    tripsHosted: {
      type: Number,
      default: 0,
    },
    travellersHosted: {
      type: Number,
      default: 0,
    },
    successRate: {
      type: Number,
      default: 0,
    },
    // % of traveller messages the host replies to (shown on the host detail page)
    responseRate: {
      type: Number,
      default: 0,
    },
    responseTimeLabel: String,

    // Regions / destinations the host operates in (host detail page chips).
    // Falls back to unique hosted-trip locations on the client when empty.
    regionsHosted: [String],

    // "Ask the host" FAQ — admin-managed question/answer pairs shown on the
    // host detail page. Falls back to generic defaults on the client when empty.
    faqs: [
      {
        question: String,
        answer: String,
      },
    ],

    // Google reviews (manual-cached): the host's Google Business link/place id.
    // Used as a reference when an admin adds the host's Google reviews; host
    // reviews stay in the host-scoped UserReviews collection (never the brand).
    googleReviewUrl: String,
    googlePlaceId: String,

    // Verification badges — admin-managed trust badges shown on the host
    // detail page. `icon` is a keyword (verified, certificate, award, trophy,
    // star, firstaid, mountain, camera, leaf, language, clock, shield). Falls
    // back to badges derived from isVerified/achievements/successRate when empty.
    verificationBadges: [
      {
        title: String,
        subtitle: String,
        icon: String,
      },
    ],

    // Contact
    phoneNumber: String,
    emailAddress: {
      type: String,
      trim: true,
      unique: true,
    },
    whatsapp: String,
    supportHours: String,

    // Social Media (Optional)
    socialMedia: {
      facebook: String,
      instagram: String,
      twitter: String,
      website: String,
    },

    // Document Uploads - All documents are now optional
    documents: {
      panCard: String,
      gstCertificate: String,
      bankPassbook: String,
      businessLicense: String,
      // Onboarding extras (additive)
      idProof: String,
      certificates: [String],
      insurance: [String],
    },

    // Finance
    commissionRate: String,

    // Razorpay
    contact_id: String,
    fund_account_id: String,

    // SEO
    seoTitle: String,
    seoSlug: String,
    metaDescription: String,

    // Login account link (Host Dashboard). Optional + additive: legacy hosts
    // without a linked User are unaffected; /host-portal/me also falls back
    // to matching emailAddress against the JWT user's email.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    // Regions the host operates in (Host Dashboard onboarding)
    regions: [String],

    // Status and Verification. "draft" = self-onboarded, awaiting admin review
    // (not live, no dashboard) — populated by the Host Onboarding portal.
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "pending",
    },
    // Where this record came from: admin-created vs host self-onboarding.
    source: { type: String, enum: ["admin", "onboarding"], default: "admin" },

    // ── Host Onboarding portal — additive optional fields (map 1:1 with the
    // onboarding form; all optional so existing hosts/flows are untouched). ──
    displayName: { type: String },
    country: { type: String },
    whyHost: { type: String },
    uniqueValue: { type: String },
    businessType: { type: String },
    altPhone: { type: String },
    emergencyContact: { name: String, role: String, phone: String },
    serviceQuality: {
      groupSize: String,
      duration: String,
      difficulty: String,
      ageGroups: [String],
      medical: String,
    },
    bankAccounts: [
      { accountHolderName: String, bankName: String, accountNumber: String, ifscCode: String },
    ],
    // Shown to the host when rejected (KYC/verification review)
    rejectionReason: { type: String, default: "" },
   
    isActive: {
      type: Boolean,
      default: true,
    },

    // Admin controls (additive): hide from public website / block dashboard login.
    // Both default true so existing hosts are unaffected.
    showOnWebsite: {
      type: Boolean,
      default: true,
    },
    dashboardAccess: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Host = mongoose.model("Host", hostSchema);
