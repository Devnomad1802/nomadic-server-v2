import assert from "node:assert";
import { isEligibleBooking, isAbandonedBooking } from "../controllers/analytics.js";
let pass=0; const ok=(n,c)=>{assert.ok(c,n);console.log("  ✓",n);pass++;};

ok("fullPayment eligible", isEligibleBooking({paymentStatus:"fullPayment"}));
ok("firstPayment eligible", isEligibleBooking({paymentStatus:"firstPayment"}));
ok("created NOT eligible", !isEligibleBooking({paymentStatus:"created"}));
ok("test-mode paid NOT eligible", !isEligibleBooking({paymentStatus:"fullPayment",mode:"test"}));
ok("created is abandoned", isAbandonedBooking({paymentStatus:"created"}));
ok("created test is NOT counted abandoned", !isAbandonedBooking({paymentStatus:"created",mode:"test"}));
ok("paid is not abandoned", !isAbandonedBooking({paymentStatus:"fullPayment"}));

// Mixed set mirroring prod groups: revenue + counts exclude created/test.
const set=[
  {paymentStatus:"fullPayment",total:1000},
  {paymentStatus:"firstPayment",total:400},
  {paymentStatus:"created",total:900},        // abandoned
  {paymentStatus:"created",mode:"live",total:19949}, // abandoned
  {paymentStatus:"fullPayment",mode:"test",total:500}, // test, excluded
];
const eligible=set.filter(isEligibleBooking);
const revenue=eligible.reduce((s,b)=>s+b.total,0);
const abandoned=set.filter(isAbandonedBooking).length;
ok("captured revenue = 1400 (paid non-test only)", revenue===1400);
ok("eligible count = 2", eligible.length===2);
ok("abandoned count = 2", abandoned===2);
console.log(`\nAll ${pass} checks passed.`);
