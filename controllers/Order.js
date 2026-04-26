import "dotenv/config";
import Razorpay from "razorpay";
import crypto from "crypto";
import { BadRequest, CustomError } from "../middlewares/index.js";

const { RAZORPAY_KEY_SECRET, RAZORPAY_KEY_ID } = process.env;

export const order = async (req, res) => {
  try {
    // Validate Razorpay credentials
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new CustomError("Razorpay credentials not configured", 500);
    }

    const razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });

    if (!req.body) {
      throw new CustomError("Bad Request", 400);
    }

    // Validate required fields for Razorpay order
    const { amount, currency, receipt } = req.body;
    if (!amount || !currency || !receipt) {
      throw new CustomError(
        "Missing required fields: amount, currency, receipt",
        400
      );
    }

    const options = req.body;

    const order = await razorpay.orders.create(options);

    if (!order) {
      throw new CustomError("Bad Request", 400);
    }

    res.json(order);
  } catch (error) {
    console.log("Final error message:", error);
    throw new BadRequest(error);
  }
};

export const validate = async (req, res) => {
  console.log("request body", req.body); s
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new CustomError(
        "Missing required payment verification fields",
        400
      );
    }

    // Validate Razorpay credentials
    if (!RAZORPAY_KEY_SECRET) {
      throw new CustomError("Razorpay credentials not configured", 500);
    }

    const sha = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
    // order_id + " | " + razorpay_payment_id

    sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);

    const digest = sha.digest("hex");

    if (digest !== razorpay_signature) {
      return res.status(400).json({ msg: " Transaction is not legit!" });
    }

    res.json({
      msg: " Transaction is legit!",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
  } catch (error) {
    console.log("Validation error:", error);
    throw new BadRequest(error?.message || "Payment validation failed");
  }
};
