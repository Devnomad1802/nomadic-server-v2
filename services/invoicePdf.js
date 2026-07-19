import PDFDocument from "pdfkit";

// ─────────────────────────────────────────────────────────────
// A4 tax-invoice PDF, generated from the SAVED booking record
// (never client state). Mirrors the approved invoice design:
// dark header band, three-column meta, experience card, pricing
// table, totals, partial/full status note, terms, footer band.
// Returns a Buffer (streamable to HTTP or attachable to email).
// ─────────────────────────────────────────────────────────────

const INK = "#221C17";
const CREAM = "#F4EEE4";
const MUTED = "#726A5E";
const FAINT = "#9C9388";
const LINE = "#E6DDCF";
const ORANGE = "#E9622F";
const GREEN = "#2E7D4F";
const AMBER = "#9A6A12";

const safeParse = (v, f) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? f); } catch { return f; } };
const inr = (n) => `Rs ${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => {
  if (!d) return "—";
  const t = new Date(d);
  return isNaN(t) ? "—" : t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const balanceDueDate = (departure) => {
  if (!departure) return null;
  const d = new Date(departure);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() - 15);
  return d;
};

// Derive every invoice value from the booking snapshot + user doc.
export const invoiceData = (booking, user) => {
  const pd = safeParse(booking.paymentDetail, {});
  const cd = safeParse(booking.cardData, { cardSectionData: [], cardDate: {}, gstTax: 0 });
  const items = Array.isArray(cd.cardSectionData) ? cd.cardSectionData : [];
  const base = items.reduce((s, it) => s + Number(it.TitlePrice || 0) * Number(it.quantity || 0), 0);
  const discount = Number(booking.coupenDiscount || 0);
  const gst = Number(cd.gstTax || 0);
  const taxable = base - discount;
  const grand = Number(booking.fullTripAmount || taxable + gst);
  const paid = Number(booking.total || 0);
  const isPartial = booking.paymentStatus === "firstPayment";
  const remaining = isPartial ? Math.max(0, Math.round(grand - paid)) : 0;
  const start = cd?.cardDate?.batchDate;
  const end = cd?.cardDate?.endSelectDate;
  const host = pd?.host || {};
  return {
    pd, items, base, discount, gst, taxable, grand, paid, remaining, isPartial,
    start, end, host,
    number: booking.invoiceNumber || "PENDING",
    invDate: fmtDate(booking.invoiceDate || booking.DateOfBooking),
    bookingId: booking.bookingId || `${booking._id}`,
    bookingDate: fmtDate(booking.DateOfBooking),
    payId: booking.razorpayPaymentId || "—",
    orderId: booking.razorpayOrderId || "—",
    custName: user?.name || booking.userName || "Traveller",
    custEmail: user?.email || booking.email || "—",
    custPhone: user?.phone || booking.phone || "—",
    travellers: Number(cd.numberOfTravelers || booking.travellersCount || 1),
    balanceDue: fmtDate(balanceDueDate(start)),
  };
};

export const buildInvoicePdf = (booking, user) =>
  new Promise((resolve, reject) => {
    try {
      const d = invoiceData(booking, user);
      const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      const W = doc.page.width; // 595
      const M = 44;

      // ── header band ──
      doc.rect(0, 0, W, 118).fill(INK);
      doc.font("Helvetica-Bold").fontSize(19);
      doc.fillColor(ORANGE).text("nomadic", M, 30, { continued: true }).fillColor(CREAM).text(" townies");
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#C9BFAE").text("The Way to Experience the World", M, 54);
      doc.font("Helvetica").fontSize(7.5).fillColor(FAINT).text(
        "Nomadic Townies · Pune, Maharashtra, India\nsupport@nomadictownies.com · www.nomadictownies.com", M, 72);
      doc.font("Helvetica-Bold").fontSize(19).fillColor("#F8F4ED").text("TAX INVOICE", 0, 30, { align: "right", width: W - M });
      const badge = d.isPartial ? "ADVANCE RECEIVED" : "PAID IN FULL";
      doc.fontSize(8).fillColor(d.isPartial ? "#F0B980" : "#A8E6BC").text(badge, 0, 56, { align: "right", width: W - M });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#D8CFC0").text(d.number, 0, 74, { align: "right", width: W - M });
      doc.font("Helvetica").fontSize(8).fillColor(FAINT).text(`Invoice date: ${d.invDate}`, 0, 88, { align: "right", width: W - M });

      // ── three meta columns ──
      let y = 140;
      const colW = (W - M * 2 - 36) / 3;
      const col = (x, title, lines) => {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#A89C8A").text(title.toUpperCase(), x, y, { characterSpacing: 1 });
        doc.moveTo(x, y + 12).lineTo(x + colW, y + 12).lineWidth(1.4).strokeColor(INK).stroke();
        doc.font("Helvetica").fontSize(8.2).fillColor(MUTED).text(lines.join("\n"), x, y + 18, { width: colW, lineGap: 2.5 });
      };
      col(M, "Billed to", [d.custName, d.custEmail, d.custPhone]);
      col(M + colW + 18, "Booking", [`Booking ID: ${d.bookingId}`, `Booking date: ${d.bookingDate}`, `Status: ${d.isPartial ? "Confirmed (deposit paid)" : "Confirmed"}`, "Source: Website"]);
      col(M + (colW + 18) * 2, "Payment", ["Mode: Razorpay", `Payment ID: ${d.payId}`, `Order ID: ${d.orderId}`, `Paid on: ${d.invDate}`]);

      // ── experience card ──
      y = 226;
      doc.roundedRect(M, y, W - M * 2, 66, 8).fillAndStroke("#FBF6EE", "#EAD9C9");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#A89C8A").text("EXPERIENCE", M + 16, y + 12, { characterSpacing: 1 });
      doc.font("Helvetica-Bold").fontSize(12.5).fillColor(INK).text(d.pd?.title || "Experience", M + 16, y + 24, { width: 300 });
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
        `${d.pd?.location || "—"} · Hosted by ${d.host?.name || "Nomadic Townies"}`, M + 16, y + 42, { width: 300 });
      const shortD = (dt) => {
        if (!dt) return "";
        const t = new Date(dt);
        return isNaN(t) ? "" : t.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      };
      const meta = [
        ["BATCH", d.start ? `${shortD(d.start)}${d.end ? ` – ${shortD(d.end)}` : ""}` : "Flexible", 92],
        ["DURATION", d.pd?.nights && d.pd?.days ? `${d.pd.nights}N · ${d.pd.days}D` : "—", 48],
        ["TRAVELLERS", `${d.travellers}`, 52],
        ["TYPE", d.start ? "Batch" : "Customized", 56],
      ];
      let mx = W - M - 16 - meta.reduce((s, m) => s + m[2], 0);
      meta.forEach(([k, v, w]) => {
        doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#A89C8A").text(k, mx, y + 16, { width: w });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(v, mx, y + 27, { width: w });
        mx += w;
      });

      // ── pricing table ──
      y = 312;
      const th = (t, x, w, align) => doc.font("Helvetica-Bold").fontSize(7.5).fillColor(CREAM).text(t, x, y + 8, { width: w, align });
      doc.roundedRect(M, y, W - M * 2, 26, 6).fill(INK);
      th("DESCRIPTION", M + 12, 220, "left"); th("QTY", M + 250, 60, "center"); th("RATE", M + 320, 80, "right"); th("AMOUNT", M + 410, W - M * 2 - 422, "right");
      y += 30;
      const row = (desc, qty, rate, amount, bold = false) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(INK);
        doc.text(desc, M + 12, y, { width: 226 });
        doc.text(qty, M + 250, y, { width: 60, align: "center" });
        doc.text(rate, M + 320, y, { width: 80, align: "right" });
        doc.font("Helvetica-Bold").text(amount, M + 410, y, { width: W - M * 2 - 422, align: "right" });
        y += 20;
        doc.moveTo(M, y - 5).lineTo(W - M, y - 5).lineWidth(0.5).strokeColor("#F1EADD").stroke();
      };
      d.items.forEach((it) => row(String(it.Title || "Item"), String(it.quantity || 1), inr(it.TitlePrice), inr(Number(it.TitlePrice || 0) * Number(it.quantity || 0))));
      if (!d.items.length) row(d.pd?.title || "Experience", `${d.travellers}`, inr(d.base / (d.travellers || 1)), inr(d.base));

      // ── totals box ──
      y += 10;
      const bx = W - M - 240; const bw = 240;
      const totals = [
        ["Subtotal", inr(d.base), false],
        ...(d.discount > 0 ? [[`Discount${booking.couponCode ? ` (${booking.couponCode})` : ""}`, `- ${inr(d.discount)}`, false]] : []),
        ["Taxable amount", inr(d.taxable), false],
        ["GST @ 5%", inr(d.gst), false],
        ["Grand total", inr(d.grand), true],
        ["Amount paid", inr(d.paid), true],
        ...(d.remaining > 0 ? [["Remaining balance", inr(d.remaining), true]] : []),
      ];
      const bh = totals.length * 20 + 8;
      doc.roundedRect(bx, y, bw, bh, 8).fillAndStroke("#FFFDF9", LINE);
      let ty = y + 8;
      totals.forEach(([k, v, bold]) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(bold ? INK : MUTED).text(k, bx + 14, ty);
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK).text(v, bx, ty, { width: bw - 14, align: "right" });
        ty += 20;
      });

      // ── status note (left of totals) ──
      const noteW = bx - M - 20;
      if (d.isPartial) {
        doc.roundedRect(M, y, noteW, 64, 8).fillAndStroke("#FBF3E4", "#EBD9B4");
        doc.font("Helvetica-Bold").fontSize(8).fillColor(AMBER).text("ADVANCE PAYMENT RECEIVED", M + 14, y + 12, { characterSpacing: 0.5 });
        doc.font("Helvetica").fontSize(8).fillColor("#8A6A3A").text(
          `Balance of ${inr(d.remaining)} due by ${d.balanceDue} (15 days before departure). Seats confirmed against booking amount.`,
          M + 14, y + 27, { width: noteW - 28, lineGap: 2 });
      } else {
        doc.roundedRect(M, y, noteW, 54, 8).fillAndStroke("#EEF7F0", "#CBE5D2");
        doc.font("Helvetica-Bold").fontSize(8).fillColor(GREEN).text("PAID IN FULL — NO DUES", M + 14, y + 12, { characterSpacing: 0.5 });
        doc.font("Helvetica").fontSize(8).fillColor("#57795F").text(
          `Payment completed on ${d.invDate}. No outstanding balance on this booking.`,
          M + 14, y + 27, { width: noteW - 28, lineGap: 2 });
      }

      // ── terms ──
      y = Math.max(y + bh, y + 80) + 24;
      doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.7).strokeColor(LINE).stroke();
      y += 12;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#A89C8A").text("TERMS & NOTES", M, y, { characterSpacing: 1 });
      y += 14;
      doc.font("Helvetica").fontSize(7).fillColor("#8A8073").text(
        "Cancellation: Booking amount is non-refundable; cancellations follow the slab-based policy at nomadictownies.com/cancellation-and-refund.  " +
        "Payment terms: For partial bookings the remaining balance is due 15 days before departure; non-payment may cancel the booking and forfeit the booking amount.  " +
        "GST: Tax charged at 5% on tour operator services (without input tax credit) as applicable. This is a system-generated tax invoice and does not require a signature.  " +
        "Support: support@nomadictownies.com — all communication and disputes via the Nomadic Townies platform. Jurisdiction: Pune, Maharashtra.",
        M, y, { width: W - M * 2, lineGap: 2.5 });

      // ── footer band ──
      const fy = doc.page.height - 78;
      doc.roundedRect(M, fy, W - M * 2, 44, 8).fill(INK);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CREAM).text(
        `Thank you for travelling with us, ${String(d.custName).split(" ")[0]} — see you out there.`, M + 18, fy + 16);
      doc.font("Helvetica-Bold").fontSize(9.5);
      doc.fillColor(ORANGE).text("nomadic", W - M - 118, fy + 16, { continued: true }).fillColor(CREAM).text(" townies");

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
