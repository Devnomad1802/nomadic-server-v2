import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema({
  // RazorpayX payout details
  payoutId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Host information
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Host',
    required: true,
    index: true
  },
  
  // Payout details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: "INR",
    enum: ["INR"]
  },
  mode: {
    type: String,
    required: true,
    enum: ["IMPS", "NEFT", "RTGS", "UPI"]
  },
  purpose: {
    type: String,
    required: true
  },
  
  // Status tracking
  status: {
    type: String,
    required: true,
    enum: [
      "queued",           // Payout is queued for processing
      "processing",       // Payout is being processed
      "processed",        // Payout has been processed successfully
      "failed",           // Payout failed
      "cancelled",        // Payout was cancelled
      "reversed"          // Payout was reversed
    ],
    default: "queued"
  },
  
  // RazorpayX response details
  razorpayStatus: {
    type: String,
    default: "queued"
  },
  razorpayFailureReason: {
    type: String,
    default: null
  },
  razorpayUtr: {
    type: String,
    default: null
  },
  razorpayProcessedAt: {
    type: Date,
    default: null
  },
  
  // Additional metadata
  referenceId: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
payoutSchema.index({ hostId: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ payoutId: 1 });
payoutSchema.index({ createdAt: -1 });

// Virtual for formatted amount
payoutSchema.virtual('formattedAmount').get(function() {
  return `₹${this.amount.toLocaleString('en-IN')}`;
});

// Virtual for status display
payoutSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'queued': 'Queued',
    'processing': 'Processing',
    'processed': 'Processed',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'reversed': 'Reversed'
  };
  return statusMap[this.status] || this.status;
});

// Pre-save middleware to update status based on RazorpayX status
payoutSchema.pre('save', function(next) {
  if (this.razorpayStatus && this.razorpayStatus !== this.status) {
    // Map RazorpayX status to our internal status
    const statusMap = {
      'queued': 'queued',
      'processing': 'processing',
      'processed': 'processed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'reversed': 'reversed'
    };
    
    if (statusMap[this.razorpayStatus]) {
      this.status = statusMap[this.razorpayStatus];
    }
  }
  next();
});

// Static method to get payout statistics
payoutSchema.statics.getPayoutStats = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.hostId) {
    matchStage.hostId = new mongoose.Types.ObjectId(filters.hostId);
  }
  
  if (filters.status) {
    matchStage.status = filters.status;
  }
  
  if (filters.from || filters.to) {
    matchStage.createdAt = {};
    if (filters.from) matchStage.createdAt.$gte = new Date(filters.from);
    if (filters.to) matchStage.createdAt.$lte = new Date(filters.to);
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPayouts: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        successfulPayouts: {
          $sum: { $cond: [{ $eq: ['$status', 'processed'] }, 1, 0] }
        },
        successfulAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'processed'] }, '$amount', 0] }
        },
        failedPayouts: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        pendingPayouts: {
          $sum: { $cond: [{ $in: ['$status', ['queued', 'processing']] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalPayouts: 0,
    totalAmount: 0,
    successfulPayouts: 0,
    successfulAmount: 0,
    failedPayouts: 0,
    pendingPayouts: 0
  };
};

const Payout = mongoose.model('Payout', payoutSchema);

export default Payout;
