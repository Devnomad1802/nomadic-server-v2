import Payout from "../models/payouts.js";
import { Host } from "../models/hosts.js";
import { Bookings } from "../models/bookings.js";
import { Trips } from "../models/trips.js";
import { BadRequest, CustomError } from "../middlewares/index.js";
import crypto from "crypto";
import { 
  createPayoutService, 
  getPayoutDetailsService, 
  getAllPayoutsService, 
  cancelPayoutService, 
  getAccountBalanceService,
  getBankingBalanceService,
  handlePayoutWebhook
} from "../services/razorpayxService.js";
import "dotenv/config";

const { RAZORPAY_WEBHOOK_SECRET } = process.env;

// Create a new payout from booking
export const createHostPayout = async (req, res, next) => {
  try {
    const { bookingId, purpose = "commission_payout", mode = "IMPS", referenceId, notes } = req.body;

    // Validate required fields
    if (!bookingId) {
      return next(new BadRequest("Booking ID is required"));
    }

    // Get booking details
    const booking = await Bookings.findById(bookingId);
    if (!booking) {
      return next(new CustomError("Booking not found", 404));
    }

    // Check if booking already has a payout
    if (booking.payoutId) {
      return next(new BadRequest("Payout already exists for this booking"));
    }

    // Get trip details
    const trip = await Trips.findById(booking.tripId);
    if (!trip) {
      return next(new CustomError("Trip not found", 404));
    }

    // Get host details
    const host = await Host.findById(trip.host);
    if (!host) {
      return next(new CustomError("Host not found for this trip", 404));
    }

    // Check if host has fund_account_id
    if (!host.fund_account_id) {
      return next(new CustomError("Host does not have a fund account set up. Please update host with bank details first.", 400));
    }

    // Calculate commission and payout amount
    const bookingAmount = Number(booking.total) || 0;
    const commissionRate = Number(trip.commissionRate) || 0;
    
    if (bookingAmount <= 0) {
      return next(new BadRequest("Invalid booking amount"));
    }

    // Calculate commission amount
    const commissionAmount = (bookingAmount * commissionRate) / 100;
    
    // Calculate amount to pay host (booking amount - commission)
    const hostPayoutAmount = bookingAmount - commissionAmount;
    const payoutAmount = Number(hostPayoutAmount.toFixed(2));

    console.log("Booking Details:", {
      bookingAmount,
      commissionRate,
      commissionAmount,
      hostPayoutAmount,
      payoutAmount
      });

    // Create payout using RazorpayX
    const payoutData = await createPayoutService(host.fund_account_id, payoutAmount, purpose, mode);
    console.log("Payout Data:", payoutData);

    // Save payout to database
    const payout = new Payout({
      payoutId: payoutData.id,
      hostId: host._id,
      amount: hostPayoutAmount,
      currency: "INR",
      mode: mode,
      purpose: purpose,
      status: payoutData.status || "queued",
      razorpayStatus: payoutData.status,
      referenceId: referenceId || `BOOKING_${bookingId}`,
      notes: notes || `Commission payout for booking ${bookingId}`,
      createdBy: req.user?.id || null
    });

    await payout.save();

    // Update booking with payout ID
    booking.payoutId = payout._id;
    await booking.save();

    res.status(201).json({
      success: true,
      message: "Payout initiated successfully",
    });

  } catch (error) {
    console.error("Create Payout Error:", error);
    return next(error);
  }
};

// Universal webhook endpoint for all RazorpayX events
export const updatePayoutStatusWebhook = async (req, res, next) => {
 try {
    // Webhook secret for verification
    const WEBHOOK_SECRET = RAZORPAY_WEBHOOK_SECRET;
    
    // Get the signature from headers
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    // Verify webhook signature
    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.log('Webhook signature verification failed');
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }
    } else {
      // Alternative: Check for secret in request body or query params
      const providedSecret = req.body.secret || req.query.secret;
      if (providedSecret !== WEBHOOK_SECRET) {
        console.log('Webhook secret verification failed');
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook secret'
        });
      }
    }

    const { event, payload } = req.body;

    console.log('Received verified webhook:', { event, payload });

    // Check if this is a payout-related event
    if (!event || !event.startsWith('payout.')) {
      return res.status(200).json({ 
        success: true,
        message: 'Event not relevant - not a payout event' 
      });
    }

    // The payout data is nested inside payload.payout.entity
    const payout = payload?.payout?.entity;
    if (!payout || !payout.id) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid payout data - missing payout ID' 
      });
    }

    // Use the webhook service to handle the event
    const result = await handlePayoutWebhook(event, payout);
    console.log("result>>>>>>>>>>>>>>", result)

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result
    });

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// Get all payouts with filtering and pagination
export const getAllPayoutsController = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      hostId,
      status,
      purpose,
      from,
      to,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filters = {};
    if (hostId) filters.hostId = hostId;
    if (status) filters.status = status;
    if (purpose) filters.purpose = new RegExp(purpose, 'i');
    
    // Date range filter
    if (from || to) {
      filters.createdAt = {};
      if (from) filters.createdAt.$gte = new Date(from);
      if (to) filters.createdAt.$lte = new Date(to);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get payouts with pagination
    const payouts = await Payout.find(filters)
      .populate('hostId', 'hostName emailAddress phoneNumber')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Payout.countDocuments(filters);

    res.status(200).json({
      success: true,
      data: payouts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Get All Payouts Error:", error);
    return next(error);
  }
};

// Get payout by ID
export const getPayoutById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payout = await Payout.findById(id)
      .populate('hostId', 'hostName emailAddress phoneNumber bankName accountNumber ifscCode')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!payout) {
      return next(new CustomError("Payout not found", 404));
    }

    res.status(200).json({
      success: true,
      data: payout
    });

  } catch (error) {
    console.error("Get Payout By ID Error:", error);
    return next(error);
  }
};

// Get payout by RazorpayX payout ID
export const getPayoutByPayoutId = async (req, res, next) => {
  try {
    const { payoutId } = req.params;

    const payout = await Payout.findOne({ payoutId })
      .populate('hostId', 'hostName emailAddress phoneNumber bankName accountNumber ifscCode')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!payout) {
      return next(new CustomError("Payout not found", 404));
    }

    res.status(200).json({
      success: true,
      data: payout
    });

  } catch (error) {
    console.error("Get Payout By Payout ID Error:", error);
    return next(error);
  }
};

// Update payout status (sync with RazorpayX)
export const updatePayoutStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payout = await Payout.findById(id);
    if (!payout) {
      return next(new CustomError("Payout not found", 404));
    }

    // Get latest status from RazorpayX
    const razorpayData = await getPayoutDetailsService(payout.payoutId);

    // Update payout with latest data
    payout.razorpayStatus = razorpayData.status;
    payout.razorpayFailureReason = razorpayData.failure_reason || null;
    payout.razorpayUtr = razorpayData.utr || null;
    payout.razorpayProcessedAt = razorpayData.processed_at ? new Date(razorpayData.processed_at * 1000) : null;
    payout.updatedBy = req.user?.id || null;

    await payout.save();

    res.status(200).json({
      success: true,
      message: "Payout status updated successfully",
      data: payout
    });

  } catch (error) {
    console.error("Update Payout Status Error:", error);
    return next(error);
  }
};

// Cancel payout
export const cancelHostPayout = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payout = await Payout.findById(id);
    if (!payout) {
      return next(new CustomError("Payout not found", 404));
    }

    // Check if payout can be cancelled
    if (payout.status === 'processed' || payout.status === 'failed' || payout.status === 'cancelled') {
      return next(new BadRequest(`Cannot cancel payout with status: ${payout.status}`));
    }

    // Cancel payout in RazorpayX
    const cancelData = await cancelPayoutService(payout.payoutId);

    // Update payout status
    payout.status = 'cancelled';
    payout.razorpayStatus = cancelData.status;
    payout.updatedBy = req.user?.id || null;

    await payout.save();

    res.status(200).json({
      success: true,
      message: "Payout cancelled successfully",
      data: payout
    });

  } catch (error) {
    console.error("Cancel Payout Error:", error);
    return next(error);
  }
};

// Get payout statistics
export const getPayoutStats = async (req, res, next) => {
  try {
    const { hostId, from, to, status } = req.query;

    const filters = {};
    if (hostId) filters.hostId = hostId;
    if (status) filters.status = status;
    if (from) filters.from = from;
    if (to) filters.to = to;

    const stats = await Payout.getPayoutStats(filters);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error("Get Payout Stats Error:", error);
    return next(error);
  }
};

// Get account balance (Legacy endpoint)
export const getAccountBalance = async (req, res, next) => {
  try {
    const balance = await getAccountBalanceService();

    res.status(200).json({
      success: true,
      data: {
        balance: balance.balance,
        currency: balance.currency,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("Get Account Balance Error:", error);
    return next(error);
  }
};

// Get banking balance (Nomadic Account Balance)
export const getBankingBalance = async (req, res, next) => {
  try {
    const balance = await getBankingBalanceService();

    res.status(200).json({
      success: true,
      balance
    });

  } catch (error) {
    console.error("Get Banking Balance Error:", error);
    return next(error);
  }
};

// Get payouts by host ID
export const getPayoutsByHost = async (req, res, next) => {
  try {
    const { hostId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      from,
      to,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Check if host exists
    const host = await Host.findById(hostId);
    if (!host) {
      return next(new CustomError("Host not found", 404));
    }

    // Build filter object
    const filters = { hostId };
    if (status) filters.status = status;
    
    // Date range filter
    if (from || to) {
      filters.createdAt = {};
      if (from) filters.createdAt.$gte = new Date(from);
      if (to) filters.createdAt.$lte = new Date(to);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get payouts
    const payouts = await Payout.find(filters)
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Payout.countDocuments(filters);

    res.status(200).json({
      success: true,
      data: payouts,
      hostInfo: {
        id: host._id,
        name: host.hostName,
        email: host.emailAddress
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Get Payouts By Host Error:", error);
    return next(error);
  }
};
