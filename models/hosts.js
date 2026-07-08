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
    responseTimeLabel: String,

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

    // Status and Verification
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // Shown to the host when rejected (KYC/verification review)
    rejectionReason: { type: String, default: "" },
   
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Host = mongoose.model("Host", hostSchema);
