import { Router } from "express";
import express from "express";
import { catchAsync } from "../middlewares/index.js";
import { handlePaymentWebhook } from "../controllers/paymentWebhook.js";

// Razorpay PAYMENT webhook (assisted payment links). MUST be mounted BEFORE the
// global express.json()/mongoSanitize() in index.js so the handler receives the
// RAW body (Buffer) and can verify the HMAC over the exact signed bytes.
export const PaymentWebhookRoute = Router();

PaymentWebhookRoute.post(
  "/payment-webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  catchAsync(handlePaymentWebhook)
);

export default PaymentWebhookRoute;
