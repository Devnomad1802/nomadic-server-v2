import assert from "node:assert";
import { visibleTripReviewFilter } from "../controllers/UserReviews.js";
let pass = 0; const ok=(n,c)=>{assert.ok(c,n);console.log("  ✓",n);pass++;};
const f = visibleTripReviewFilter("TRIP_123");
ok("filters by the exact tripId", f.tripId === "TRIP_123");
ok("excludes pending/rejected", JSON.stringify(f.status) === JSON.stringify({ $nin: ["pending","rejected"] }));
ok("excludes host-scoped reviews", JSON.stringify(f.entityType) === JSON.stringify({ $ne: "host" }));
ok("no hostId / name / slug in filter (trip-only)", !("hostId" in f) && !("tripName" in f) && !("slug" in f));
console.log(`\nAll ${pass} checks passed.`);
