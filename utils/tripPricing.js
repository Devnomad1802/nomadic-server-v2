// Server-authoritative host-markup pricing for trip booking options.
// Mirror of the admin client's pricing.js — the SERVER recomputes the customer
// selling price so a host (or a crafted request) can never set it directly.
//
//   selling (excl GST) = B2B × (1 + markup/100)
//
// Integer paise throughout to avoid float drift; GST is a separate step, never
// folded in here. markup% = the host's admin-configured commissionRate.

// { ok, sellingPaise, sellingRupees } or { ok:false, reason }. Never fabricates.
export const computeSelling = (b2bRupees, markupPct) => {
  const b2b = Number(b2bRupees);
  const pct = Number(markupPct);
  if (b2bRupees === "" || b2bRupees == null || !isFinite(b2b) || b2b < 0) {
    return { ok: false, reason: "b2b" };
  }
  if (markupPct === "" || markupPct == null || !isFinite(pct) || pct < 0) {
    return { ok: false, reason: "markup" };
  }
  const b2bPaise = Math.round(b2b * 100);
  const markupPaise = Math.round((b2bPaise * pct) / 100);
  const sellingPaise = b2bPaise + markupPaise;
  return { ok: true, sellingPaise, sellingRupees: sellingPaise / 100 };
};

export const sellingRupees = (b2bRupees, markupPct) => {
  const r = computeSelling(b2bRupees, markupPct);
  return r.ok ? r.sellingRupees : "";
};

// Parse an addsection value that may arrive as a JSON string, an array, or junk.
export const parseSections = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Recompute every option's selling price (TitlePrice) from its hostB2BPrice at
// the authoritative markup. Rules:
//   • option has a valid hostB2BPrice  → TitlePrice = computed selling, markupRate stamped
//   • option has no/blank hostB2BPrice → LEGACY: keep its existing TitlePrice untouched
// The client's TitlePrice and markupRate are never trusted. Section/option order
// and every other field (Title, ids, extras) are preserved exactly.
export const recomputeSections = (sections, markupPct) => {
  const list = parseSections(sections);
  return list.map((sec) => {
    if (!sec || !Array.isArray(sec.array)) return sec;
    return {
      ...sec,
      array: sec.array.map((item) => {
        if (!item || typeof item !== "object") return item;
        const b2b = item.hostB2BPrice;
        const hasB2B = b2b !== "" && b2b != null;
        if (!hasB2B) {
          // Legacy row: preserve stored selling price; drop any client markupRate
          // claim but keep the row otherwise intact.
          return { ...item };
        }
        const r = computeSelling(b2b, markupPct);
        if (!r.ok) {
          // Invalid B2B or missing host rate → do NOT invent a price; keep legacy
          // TitlePrice and record the rate we tried (may be blank).
          return { ...item, markupRate: markupPct === "" || markupPct == null ? "" : Number(markupPct) };
        }
        return { ...item, TitlePrice: String(r.sellingRupees), markupRate: Number(markupPct) };
      }),
    };
  });
};
