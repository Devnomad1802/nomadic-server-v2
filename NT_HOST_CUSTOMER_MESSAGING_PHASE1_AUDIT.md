# NT — Host↔Customer Messaging + Email — PHASE 1 AUDIT (pre-code)

Date: 2026-11-27. Status: **audit only. No code changed. No prod/mail touched.**
Directive: NT_Host_Customer_Email_Messaging_Integration.md (Phase 1 = audit before edits).

## Existing system (reuse — do NOT build a parallel one)

| Piece | Location | Notes |
|---|---|---|
| Chat model | models/enquire.js | ONE `Enquire` doc per `(userId, hostId)`. `chat:[{MessageBy,Message,timeStamp,history,deleted}]`, `hostUnread`, `userUnread`, `moderation{violations,pausedUntil}`. Keyed by enquiry, **not** by booking. |
| Customer side | controllers/hostChat.js | `startHostChat`, `getMyHostChats`, `sendHostChatMessage`, `markHostChatRead`. Contact-sharing moderation; 3 strikes → 1h pause. |
| Host side | controllers/hostPortal.js:420 `replyToEnquiry` | Appends `MessageBy:"host"`, sets `userUnread++`. Also list (157) + markRead (869). |
| Admin monitor | controllers/hostChat.js:163 `getAdminConversations` / `getAdminConversation` | Read-only, admin-only, keeps original of edited/deleted. |
| Realtime | services/hostEvents.js (`emitToHost`) + services/webPush.js (`sendPushToHost`) | HOST side only. No customer-side realtime/push. |
| Serialize/moderate | utils/chatSerialize.js, utils/contactModeration.js | `validateMessage`, `serializeChatForParticipant`, `orderChatAsc`. |
| Transactional email (modern) | services/bookingEmailService.js | **Resend** (`RESEND_API_KEY`). `from = MAIL_FROM \|\| "Nomadic Townies <noreply@nomadictownies.com>"`. Booking confirmations ship in prod → domain verified for noreply@. |
| Legacy email | utils/sendMail.js | **nodemailer**, hardcoded `from: mudassarnetixsol@gmail.com` / `danish79786@gmail.com` (personal Gmail dev leftovers). |
| OTP / activation | services/emailOtpService.js | OTP flow exists (basis for pending-customer activation CTA). |

## Audit matrix (confirmed findings)

| # | Observed | Evidence | Root cause | Severity | Fix (Phase 2/3) |
|---|---|---|---|---|---|
| G1 | **No email when a message is sent — either direction.** | notifyHostMessage (hostChat.js:9) = SSE + web push only; replyToEnquiry (hostPortal.js:445-449) notifies customer with NOTHING. | Email notification never built for chat; only in-app/push to host. | **High** (core of directive Phase 3) | On each new message, send a transactional "new message" email to the OTHER party's verified address via Resend, with excerpt + portal CTA. Track status separately from chat. |
| G2 | **Host cannot reach a confirmed-booking customer who never enquired.** | Enquire keyed by (userId, hostId); imported/assisted bookings create no Enquire thread. | Chat is enquiry-scoped, not booking-scoped. | **High** | Let host open/au­to-create a conversation from a confirmed booking (reuse Enquire; attach tripId/bookingId context). Authorize by booking ownership server-side. |
| G3 | **Two mail senders; one uses personal Gmail.** | utils/sendMail.js:27,152,255. | Dev leftover never removed. | **Med** (reputation/spoof risk) | Chat email MUST go through Resend from the verified brand sender. Do not use sendMail.js for this. Quarantine/retire the Gmail paths separately. |
| G4 | **Customer side has no realtime/push.** | Only `emitToHost`/`sendPushToHost` exist. | Client realtime never added. | **Med** | Email + unread counter is enough for v1 (directive allows efficient polling). Realtime to client is optional later. |
| G5 | **Pending-activation (imported) customers have no password.** | importPayment creates `isVerified:false`, no password. | By design (Add Customer). | **Med** | Email CTA for these must route through the existing OTP/expiring single-use activation (emailOtpService), then back to the conversation. No manual passwords. |
| G6 | **Sender is noreply@, directive prefers hello@.** | bookingEmailService.js:228. | MAIL_FROM default. | **Low/blocker** | See B1. |

## Blockers / decisions needed before Phase 2 code

- **B1 — sender address.** Resend is verified for `noreply@nomadictownies.com` (booking mail works). `hello@nomadictownies.com` as From needs its own Resend domain/sender verification — I cannot confirm that from here. Directive says "report blocker rather than spoof." **Decision: ship chat email from the verified `noreply@` (or set `MAIL_FROM`), or verify hello@ in Resend first.** Never a host/customer personal address.
- **B2 — conversation scope.** Confirm the approach: **reuse `Enquire`** as the single thread store and add booking-linked access + trip/batch context (recommended, no parallel system), vs. a new Conversation model (rejected by directive).
- **B3 — repos in scope.** Server + host-v2 + client-v2-nextjs + admin-v2 all need touches (host compose-from-booking, client Message Host on imported/assisted trips, admin delivery-status column). Confirm all four are in play this pass or sliced.
- **B4 — provider cost/quota.** Reuse existing Resend plan only (directive: no new paid APIs). Need current Resend quota headroom confirmed by owner.

## Not in scope / parked
- Inbound email reply (Phase 3 optional) — needs secure alias + signed webhook; **do not** touch DNS. Default reply path = portal.
- The separate P0 NT/26-27/0002 data repair (different directive) remains parked.

**STOP — awaiting decisions on B1–B4 before writing Phase 2/3 code.**
