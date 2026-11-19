import assert from "node:assert";
import { orderChatAsc, serializeChatForParticipant, DELETED_PLACEHOLDER } from "../utils/chatSerialize.js";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ✓", n); pass++; };

const ids = (arr) => arr.map((m) => m._id);
const texts = (arr) => arr.map((m) => m.Message);

// 1. Shuffled across 13, 15, 17 Nov → ascending.
const shuffled = [
  { _id: "c", Message: "17th", timeStamp: "2026-11-17T09:00:00Z" },
  { _id: "a", Message: "13th", timeStamp: "2026-11-13T09:00:00Z" },
  { _id: "b", Message: "15th", timeStamp: "2026-11-15T09:00:00Z" },
];
assert.deepEqual(ids(orderChatAsc(shuffled)), ["a", "b", "c"]);
ok("shuffled 13/15/17 → ascending", true);

// 2. Same day, different hours → by full timestamp.
const sameDay = [
  { _id: "y", Message: "noon", timeStamp: "2026-11-15T12:00:00Z" },
  { _id: "x", Message: "morn", timeStamp: "2026-11-15T08:00:00Z" },
];
assert.deepEqual(ids(orderChatAsc(sameDay)), ["x", "y"]);
ok("same day sorts by time", true);

// 3. Equal timestamps → deterministic (insertion order preserved).
const equal = [
  { _id: "first", timeStamp: "2026-11-15T10:00:00Z" },
  { _id: "second", timeStamp: "2026-11-15T10:00:00Z" },
];
assert.deepEqual(ids(orderChatAsc(equal)), ["first", "second"]);
assert.deepEqual(ids(orderChatAsc([...equal].reverse())), ["second", "first"]);
ok("equal timestamps keep insertion order (stable)", true);

// 4. Identical text, different IDs → BOTH preserved (no dedup by text).
const dupText = [
  { _id: "m1", Message: "Is this trip happening?", timeStamp: "2026-11-15T09:00:00Z" },
  { _id: "m2", Message: "Is this trip happening?", timeStamp: "2026-11-16T09:00:00Z" },
];
assert.equal(orderChatAsc(dupText).length, 2);
assert.deepEqual(ids(orderChatAsc(dupText)), ["m1", "m2"]);
ok("identical text, different IDs → both kept", true);

// 5. Undated / invalid timestamp → keeps insertion position, never crashes.
const undated = [
  { _id: "u1", Message: "no ts" },
  { _id: "d1", Message: "dated", timeStamp: "2026-11-15T09:00:00Z" },
  { _id: "u2", Message: "bad ts", timeStamp: "not-a-date" },
];
assert.deepEqual(ids(orderChatAsc(undated)), ["u1", "d1", "u2"]);
ok("undated/invalid kept in place", true);

// 6. Cross-month / cross-year ascending.
const crossYear = [
  { _id: "jan", timeStamp: "2027-01-02T00:00:00Z" },
  { _id: "dec", timeStamp: "2026-12-31T23:00:00Z" },
];
assert.deepEqual(ids(orderChatAsc(crossYear)), ["dec", "jan"]);
ok("cross-year ascending", true);

// 7. Pure — does not mutate input.
const original = [
  { _id: "b", timeStamp: "2026-11-16T09:00:00Z" },
  { _id: "a", timeStamp: "2026-11-15T09:00:00Z" },
];
orderChatAsc(original);
assert.deepEqual(ids(original), ["b", "a"]);
ok("input not mutated", true);

// 8. serializeChatForParticipant orders AND hides deleted content.
const mixed = [
  { _id: "r", MessageBy: "host", Message: "reply", timeStamp: "2026-11-17T09:00:00Z", deleted: false },
  { _id: "q", MessageBy: "user", Message: "secret gone", timeStamp: "2026-11-13T09:00:00Z", deleted: true },
];
const out = serializeChatForParticipant(mixed);
assert.deepEqual(ids(out), ["q", "r"]);
assert.equal(out[0].Message, DELETED_PLACEHOLDER);
assert.equal(texts(out).includes("secret gone"), false);
ok("serialize orders asc + deleted → placeholder, no leak", true);

// 9. Empty / nullish safe.
assert.deepEqual(orderChatAsc([]), []);
assert.deepEqual(orderChatAsc(undefined), []);
ok("empty/undefined safe", true);

console.log(`\nAll ${pass} checks passed.`);
