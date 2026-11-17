import { createRequire } from "module";
import { PushSubscription } from "../models/pushSubscription.js";

// web-push is CommonJS and exposes no ESM default export — load via require.
const require = createRequire(import.meta.url);
const webpush = require("web-push");

// ─────────────────────────────────────────────────────────────
// Web Push delivery. Configured from env (VAPID keys live server-side
// only — never sent to the client except the PUBLIC key). Payloads are
// PII-free: a generic title/body + an opaque in-app deep link. Expired
// subscriptions (404/410) are pruned automatically.
// ─────────────────────────────────────────────────────────────

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:support@nomadictownies.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  configured = true;
} else {
  console.warn("[webPush] VAPID keys missing — push disabled.");
}

export const pushConfigured = () => configured;
export const vapidPublicKey = () => VAPID_PUBLIC_KEY || null;

export const saveSubscription = async (hostId, subscription, userAgent) => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid subscription");
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { hostId: String(hostId), endpoint: subscription.endpoint, keys: subscription.keys, userAgent },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const removeSubscription = (endpoint) =>
  PushSubscription.deleteOne({ endpoint });

// Fire-and-forget: never blocks the request path.
export const sendPushToHost = async (hostId, payload) => {
  if (!configured) return;
  const subs = await PushSubscription.find({ hostId: String(hostId) });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload),
        );
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: s._id }); // expired → prune
        }
      }
    }),
  );
};
