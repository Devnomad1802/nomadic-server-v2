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
    foundedYear: String,
    experience: String,

    hqLocation: String,
    achievements: [String],
    gallery: [String],

    // Specialties & Expertise - Array of strings
    specialties: [String],

    // Trust & Service Quality
    isVerified: {
      type: Boolean,
      default: false,
    },

    tripsHosted: {
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

    // Status and Verification
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
   
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
