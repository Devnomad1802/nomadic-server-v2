import mongoose from "mongoose";

const bannerSchema = mongoose.Schema({
  // New banner structure
  home: [{ 
    url: { type: String, required: true },
    key: { type: String, required: true },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  }],
  homeVideo: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  allPakeges: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  blog: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  aboutUs: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  contactUs: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  footer: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  aboutSection: { 
    url: { type: String },
    key: { type: String },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String },
    uploadType: { type: String, enum: ['single', 'multipart'] },
    parts: { type: Number, default: 1 }
  },
  toggle: { type: Boolean, default: true },

  // Legacy fields for backward compatibility
  BannerType: { type: String, required: false },
  Banner_Image: { type: String, default: null },
  Card_Image: [{ type: String }],
  links: [{ type: String }],

  Date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
bannerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Banners = mongoose.model("Banners", bannerSchema);
