import assert from "node:assert";
import { buildBatchAvailability, seatUrgencyLabel } from "../services/seatAvailability.js";
let p=0; const ok=(n,c)=>{assert.ok(c,n);console.log("  ✓",n);p++;};
const cap = (n)=>JSON.stringify([{batchSeats:String(n)}]);

// capacity/occupied/remaining
let a = buildBatchAvailability(cap(8), {0:0})[0];
ok("8 cap / 0 occ -> 8/8, no label", a.capacity===8 && a.remaining===8 && a.label===null);
a = buildBatchAvailability(cap(8), {0:1})[0];
ok("8 cap / 1 occ -> 7/8, no label", a.remaining===7 && a.capacity===8 && a.label===null);
a = buildBatchAvailability(cap(8), {0:3})[0];
ok("8 cap / 3 occ -> 5/8", a.remaining===5 && a.label===null);
a = buildBatchAvailability(cap(8), {0:6})[0];
ok("8 cap / 6 occ -> 2/8 + Few Seats Left", a.remaining===2 && a.label==="Few Seats Left");
a = buildBatchAvailability(cap(12), {0:6})[0];
ok("12 cap / 6 occ -> 6/12 + Filling Fast", a.remaining===6 && a.label==="Filling Fast");
a = buildBatchAvailability(cap(8), {0:8})[0];
ok("8 cap / 8 occ -> 0/8 Sold Out + soldOut", a.remaining===0 && a.label==="Sold Out" && a.soldOut===true);
a = buildBatchAvailability(cap(8), {0:10})[0];
ok("overbooked flagged, remaining clamps to 0", a.remaining===0 && a.overbooked===true);
ok("Few Seats Left beats Filling Fast", seatUrgencyLabel(8,6)==="Few Seats Left"); // rem 2
ok("zero capacity -> Sold Out", seatUrgencyLabel(0,0)==="Sold Out");
console.log(`\nAll ${p} checks passed.`);
