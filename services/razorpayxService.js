
import axios from "axios";
import dotenv from "dotenv";
import { CustomError } from "../middlewares/throwErrors.js";
import Payout from "../models/payouts.js";

dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAYX_ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;

const razorpayClient = axios.create({
  baseURL: "https://api.razorpay.com/v1",
  auth: {
    username: RAZORPAY_KEY_ID,
    password: RAZORPAY_KEY_SECRET,
  },
});

// 🚀 Create Contact
const createContactService = async (host) => {
  try {
    const res = await razorpayClient.post("/contacts", {
      name: host.name,
      email: host.email,
      contact: host.contact,
      type: "vendor", // or employee
      reference_id: `host_${host.name}`,
    });
    return res.data;
  } catch (error) {
    console.error("RazorpayX Create Contact Error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new CustomError(
        `Invalid contact data: ${error.response.data.error?.description || error.message}`,
        400
      );
    } else if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to create contact: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Create Fund Account
const createFundAccountService = async (contactId, bankDetails) => {
  try {
    const res = await razorpayClient.post("/fund_accounts", {
      contact_id: contactId,
      account_type: "bank_account",
      bank_account: {
        name: bankDetails.name,
        ifsc: bankDetails.ifsc,
        account_number: bankDetails.account_number,
      },
    });
    return res.data;
  } catch (error) {
    console.error("RazorpayX Create Fund Account Error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new CustomError(
        `Invalid bank details: ${error.response.data.error?.description || error.message}`,
        400
      );
    } else if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Contact not found", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to create fund account: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Create Payout
const createPayoutService = async (fundAccountId, amount) => {
  try {
    const res = await razorpayClient.post("/payouts", {
      account_number: RAZORPAYX_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: amount * 100, // INR → paise
      currency: "INR",
      mode: "IMPS", // or NEFT, RTGS, UPI
      purpose: "payout",
      queue_if_low_balance: true,
    });
    return res.data;
  } catch (error) {
    console.error("RazorpayX Create Payout Error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new CustomError(
        `Invalid payout data: ${error.response.data.error?.description || error.message}`,
        400
      );
    } else if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Fund account not found", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to create payout: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🌟 High-Level Function
export const payoutToHost = async (hostId, amount, db) => {
  try {
    // 1. Fetch host details from DB
    const host = await db.getHostById(hostId);
    if (!host) {
      throw new CustomError("Host not found", 404);
    }

    // If host already has fund_account_id, use it
    if (host.fund_account_id) {
      return await createPayoutService(host.fund_account_id, amount);
    }

    // 2. Create Contact
    const contact = await createContactService(host);

    // 3. Create Fund Account
    const fundAccount = await createFundAccountService(contact.id, {
      name: host.bank_name,
      ifsc: host.ifsc,
      account_number: host.account_number,
    });

    // 4. Save IDs in DB for future payouts
    await db.updateHost(hostId, {
      contact_id: contact.id,
      fund_account_id: fundAccount.id,
    });

    // 5. Do Payout
    return await createPayoutService(fundAccount.id, amount);
  } catch (err) {
    console.error("Payout Error:", err.response?.data || err.message);

    // If it's already a CustomError, re-throw it
    if (err instanceof CustomError) {
      throw err;
    }

    // For other errors, wrap them in CustomError
    throw new CustomError(
      `Payout failed: ${err.response?.data?.error?.description || err.message}`,
      500
    );
  }
};

// 🚀 Update Contact
const updateContactService = async (contactId, contactData) => {
  try {
    const res = await razorpayClient.patch(`/contacts/${contactId}`, {
      name: contactData.name,
      email: contactData.email,
      contact: contactData.contact,
    });
    return res.data;
  } catch (error) {
    console.error("RazorpayX Update Contact Error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new CustomError(
        `Invalid contact data: ${error.response.data.error?.description || error.message}`,
        400
      );
    } else if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Contact not found", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to update contact: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Get Payout Details
const getPayoutDetailsService = async (payoutId) => {
  try {
    const res = await razorpayClient.get(`/payouts/${payoutId}`);
    return res.data;
  } catch (error) {
    console.error("RazorpayX Get Payout Error:", error.response?.data || error.message);

    if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Payout not found", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to get payout details: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Get All Payouts
const getAllPayoutsService = async (filters = {}) => {
  try {
    const params = new URLSearchParams();

    // Add filters
    if (filters.count) params.append('count', filters.count);
    if (filters.skip) params.append('skip', filters.skip);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    if (filters.status) params.append('status', filters.status);
    if (filters.purpose) params.append('purpose', filters.purpose);

    const res = await razorpayClient.get(`/payouts?${params.toString()}`);
    return res.data;
  } catch (error) {
    console.error("RazorpayX Get All Payouts Error:", error.response?.data || error.message);

    if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to get payouts: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Cancel Payout
const cancelPayoutService = async (payoutId) => {
  try {
    const res = await razorpayClient.post(`/payouts/${payoutId}/cancel`);
    return res.data;
  } catch (error) {
    console.error("RazorpayX Cancel Payout Error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new CustomError(
        `Cannot cancel payout: ${error.response.data.error?.description || error.message}`,
        400
      );
    } else if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Payout not found", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to cancel payout: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Get Account Balance (Legacy endpoint)
const getAccountBalanceService = async () => {
  try {
    console.log("RAZORPAYX_ACCOUNT_NUMBER", RAZORPAYX_ACCOUNT_NUMBER);
    console.log("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID);
    console.log("API Base URL:", razorpayClient.defaults.baseURL);

    // Try the correct RazorpayX endpoint
    const res = await razorpayClient.get(`/accounts/${RAZORPAYX_ACCOUNT_NUMBER}/balance`);
    return res.data;
  } catch (error) {
    console.error("RazorpayX Get Balance Error:", error.response?.data || error.message);
    console.error("Full error response:", error.response);

    if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed - Check if API keys are in test mode", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Account not found - Verify test account number and test mode setup", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to get account balance: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Get Banking Balance (New endpoint)
const getBankingBalanceService = async () => {
  try {
    console.log("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID);
    console.log("API Base URL:", razorpayClient.defaults.baseURL);

    // Use the correct RazorpayX banking balance endpoint
    const res = await razorpayClient.get("/banking_balances");
    return res.data;
  } catch (error) {
    console.error("RazorpayX Get Banking Balance Error:", error.response?.data || error.message);
    console.error("Full error response:", error.response);

    if (error.response?.status === 401) {
      throw new CustomError("RazorpayX authentication failed - Check if API keys are in test mode", 401);
    } else if (error.response?.status === 404) {
      throw new CustomError("Banking balance not found - Verify test mode setup", 404);
    } else if (error.response?.status === 429) {
      throw new CustomError("RazorpayX rate limit exceeded", 429);
    } else {
      throw new CustomError(
        `Failed to get banking balance: ${error.response?.data?.error?.description || error.message}`,
        500
      );
    }
  }
};

// 🚀 Webhook Services for Payout Events
const handlePayoutProcessed = async (payoutData) => {
  try {
    console.log('Processing payout.processed event:', payoutData.id);

    // Find the payout in our database
    const existingPayout = await Payout.findOne({ payoutId: payoutData.id });
    if (!existingPayout) {
      throw new Error(`Payout not found: ${payoutData.id}`);
    }

    // Update payout status
    existingPayout.razorpayStatus = payoutData.status;
    existingPayout.status = 'processed';
    existingPayout.razorpayUtr = payoutData.utr || null;
    existingPayout.razorpayProcessedAt = payoutData.processed_at ? new Date(payoutData.processed_at * 1000) : null;
    existingPayout.updatedAt = new Date();

    await existingPayout.save();

    // Additional business logic for successful payout
    console.log(`Payout processed successfully: ${payoutData.id}, UTR: ${payoutData.utr}`);

    return {
      success: true,
      message: 'Payout processed successfully',
      payoutId: payoutData.id,
      utr: payoutData.utr
    };

  } catch (error) {
    console.error('Error handling payout.processed:', error);
    throw error;
  }
};

const handlePayoutFailed = async (payoutData) => {
  try {
    console.log('Processing payout.failed event:', payoutData.id);

    // Find the payout in our database
    const existingPayout = await Payout.findOne({ payoutId: payoutData.id });
    if (!existingPayout) {
      throw new Error(`Payout not found: ${payoutData.id}`);
    }

    // Update payout status
    existingPayout.razorpayStatus = payoutData.status;
    existingPayout.status = 'failed';
    existingPayout.razorpayFailureReason = payoutData.failure_reason || null;
    existingPayout.updatedAt = new Date();

    await existingPayout.save();

    // Additional business logic for failed payout
    console.log(`Payout failed: ${payoutData.id}, Reason: ${payoutData.failure_reason}`);

    return {
      success: true,
      message: 'Payout failure handled',
      payoutId: payoutData.id,
      failureReason: payoutData.failure_reason
    };

  } catch (error) {
    console.error('Error handling payout.failed:', error);
    throw error;
  }
};

const handlePayoutCancelled = async (payoutData) => {
  try {
    console.log('Processing payout.cancelled event:', payoutData.id);

    // Find the payout in our database
    const existingPayout = await Payout.findOne({ payoutId: payoutData.id });
    if (!existingPayout) {
      throw new Error(`Payout not found: ${payoutData.id}`);
    }

    // Update payout status
    existingPayout.razorpayStatus = payoutData.status;
    existingPayout.status = 'cancelled';
    existingPayout.updatedAt = new Date();

    await existingPayout.save();

    // Additional business logic for cancelled payout
    console.log(`Payout cancelled: ${payoutData.id}`);

    return {
      success: true,
      message: 'Payout cancellation handled',
      payoutId: payoutData.id
    };

  } catch (error) {
    console.error('Error handling payout.cancelled:', error);
    throw error;
  }
};

const handlePayoutQueued = async (payoutData) => {
  try {
    console.log('Processing payout.queued event:', payoutData.id);

    // Find the payout in our database
    const existingPayout = await Payout.findOne({ payoutId: payoutData.id });
    if (!existingPayout) {
      throw new Error(`Payout not found: ${payoutData.id}`);
    }

    // Update payout status
    existingPayout.razorpayStatus = payoutData.status;
    existingPayout.status = 'queued';
    existingPayout.updatedAt = new Date();

    await existingPayout.save();

    console.log(`Payout queued: ${payoutData.id}`);

    return {
      success: true,
      message: 'Payout queued',
      payoutId: payoutData.id
    };

  } catch (error) {
    console.error('Error handling payout.queued:', error);
    throw error;
  }
};

const handlePayoutProcessing = async (payoutData) => {
  try {
    console.log('Processing payout.processing event:', payoutData.id);

    // Find the payout in our database
    const existingPayout = await Payout.findOne({ payoutId: payoutData.id });
    if (!existingPayout) {
      throw new Error(`Payout not found: ${payoutData.id}`);
    }

    // Update payout status
    existingPayout.razorpayStatus = payoutData.status;
    existingPayout.status = 'processing';
    existingPayout.updatedAt = new Date();

    await existingPayout.save();

    console.log(`Payout processing: ${payoutData.id}`);

    return {
      success: true,
      message: 'Payout processing',
      payoutId: payoutData.id
    };

  } catch (error) {
    console.error('Error handling payout.processing:', error);
    throw error;
  }
};

// 🚀 Main Webhook Handler
const handlePayoutWebhook = async (event, payoutData) => {
  try {
    console.log(`Handling webhook event: ${event} for payout: ${payoutData.id}`);

    // Route to appropriate handler based on event type
    switch (event) {
      case 'payout.processed':
        return await handlePayoutProcessed(payoutData);

      case 'payout.failed':
        return await handlePayoutFailed(payoutData);

      case 'payout.cancelled':
        return await handlePayoutCancelled(payoutData);

      case 'payout.queued':
        return await handlePayoutQueued(payoutData);

      case 'payout.processing':
        return await handlePayoutProcessing(payoutData);

      default:
        console.log(`Unhandled event type: ${event}`);
        return {
          success: true,
          message: 'Event not handled',
          event: event
        };
    }

  } catch (error) {
    console.error(`Error handling webhook event ${event}:`, error);
    throw error;
  }
};

// Export individual functions for use in controllers
export {
  createContactService,
  createFundAccountService,
  createPayoutService,
  updateContactService,
  getPayoutDetailsService,
  getAllPayoutsService,
  cancelPayoutService,
  getAccountBalanceService,
  getBankingBalanceService,
  handlePayoutWebhook
};
