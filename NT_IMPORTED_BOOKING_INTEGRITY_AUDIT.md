# NT — Imported Payment Booking & Invoice Integrity — AUDIT (pre-code)

Date: 2026-11-27. Scope: incident on imported ₹35,699 booking + invoice NT/26-27/0002.
Status: **root cause VERIFIED in code. No code changed yet. No prod touched.**

---

## 1. Verified root cause (single defect, three symptoms)

Normal website checkout (`createSecureOrder`, controllers/Order.js:185-234) persists **two
denormalized JSON snapshots** on the booking:

- `paymentDetail` = `{ title, location, days, nights, host, images, … }`
- `cardData` = `{ numberOfTravelers, cardDate:{batchDate,endSelectDate,numberOfDays}, gstTax, cardSectionData:[lineItems] }`

**Every display and invoice field reads from those snapshots — not from `tripId`:**

| Field | Read site | Source key |
|---|---|---|
| Trip Name (admin table) | admin BookingTable.jsx:805 | `paymentDetail.title` |
| No of Travellers | BookingTable.jsx:869 | `cardData.numberOfTravelers` |
| No of Days | BookingTable.jsx:890 | `paymentDetail.days` |
| Date of Trip | BookingTable.jsx:911 | `cardData.cardDate.batchDate` |
| Invoice trip title | services/invoicePdf.js:117 | `paymentDetail.title` → falls back to "Experience" |
| Invoice batch | invoicePdf.js:126 | `cardData.cardDate.batchDate` → "Flexible" |
| Invoice type | invoicePdf.js:129 | derived → "Customized" when no batchDate |
| Invoice line items / subtotal | invoicePdf.js:39,154 | `cardData.cardSectionData` → empty → base 0 |
| Invoice GST / taxable | invoicePdf.js:42-43 | `cardData.gstTax` → 0 |

**`confirmImportPayment` (controllers/importPayment.js:243-265) writes NEITHER snapshot.**
`createAssistedLink` (controllers/assistedBooking.js:97-101) also writes neither.

→ Blank trip name, blank travellers, blank days, blank trip date, zero subtotal/taxable/GST.
Grand total still shows ₹35,699 because `fullTripAmount` IS set and invoicePdf.js:44 falls back
to it (`grand = fullTripAmount || taxable+gst`). That fallback is what let a zero-line-item
invoice be issued at all.

## 2. Secondary defects (independent)

- **D2 — invoice "Source" is hardcoded.** invoicePdf.js:110 literally prints `"Source: Website"`
  for every invoice regardless of `booking.source`. Imported/admin-assisted invoices mislabel.
- **D3 — no reconciliation guard.** invoicePdf.js:44 fabricates a grand total from `fullTripAmount`
  when line items are empty, so an invoice whose subtotal ≠ grand total still issues and still
  consumes a real FY invoice number. Directive §4/§8 says this case must BLOCK issuance.
- **D4 — invoice number already consumed.** NT/26-27/0002 was assigned via the atomic FY counter
  (`nextInvoiceNumber`). Numbers are never reused. Any correction must follow a credit-note /
  reissue path, not silent overwrite (directive §4).

## 3. What I CANNOT verify — access blockers (reported, NOT assumed pass)

I am SSH-blocked (classifier) and have no prod DB / Razorpay-live access. Unverified:

- Whether invoice NT/26-27/0002 was **emailed/delivered** to the customer. (Mail provider logs
  needed — directive §6. Current state: **Unknown**, not "not sent".)
- The **actual Razorpay capture**: amount/currency/refund/dispute status of the real payment.
- The real **customer association** and whether `userId` points at a valid customer.
- The ₹58 "Discover Andaman's Paradise" row provenance (test vs live) — must inspect, not modify.

These are blockers per directive §9 ("report unavailable access as blocker, not success").

## 4. Proposed fix (feature branch `feature/fix-imported-booking-integrity`) — AWAITING APPROVAL

Code (new bookings — stops the bleed):
1. `confirmImportPayment` + `createAssistedLink`: build and persist the SAME `paymentDetail` +
   `cardData` snapshots `createSecureOrder` writes (reuse `calc.lineItems`, `calc.gst`, trip
   title/days/host, batch date/days from `selectDate`/`endSelectDate`/`numberOfDays`). One shared
   helper so all three paths stay identical.
2. invoicePdf.js: print real `booking.source` label (D2); **block issuance** when line items are
   empty or `Σlineitems + gst ≠ grand` (D3) — return a validation error instead of a number.
3. Add self-check tests: imported/assisted booking snapshot == website booking contract;
   zero-subtotal invoice is refused.

Existing broken record (NT/26-27/0002) — **separate approval + access, NOT in this code change**:
- Dry-run before/after (masked) once I have authorized read access or you run the query.
- Backfill the snapshot from the real trip/selection, OR credit-note + reissue if the invoice was
  emailed. Decision depends on §3 delivery finding.
- No re-import as a second booking. No rollback of the captured payment.

## 5. Immediate containment (recommended now)

- **Do not use Import payment / Create payment link in production** until fix #1 lands — every
  such booking is currently born blank and will mis-invoice.
- Do not resend / re-download NT/26-27/0002.
- Admin/Vercel + droplet already on the new code; the buttons work but produce broken rows, so
  hold off operationally rather than redeploy.

---

**STOP — awaiting approval** on: (a) the fix approach above, (b) how to get the §3 prod facts
(you run read-only queries I provide, or grant access), (c) repair vs credit-note once delivery
state is known.
