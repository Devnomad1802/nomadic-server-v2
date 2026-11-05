# DATA RESET — DRY RUN MANIFEST (no deletion executed)

**Status:** PROPOSAL. Read-only audit done. Nothing deleted or archived. Each actual reset needs separate written approval with exact scope + backup evidence.
**Environment:** ONE production MongoDB Atlas cluster (`nomadictownies`). No separate staging DB verified — treat every operation as production. Date basis: Asia/Kolkata.

## 0. Provenance basis (why records are "test")
Razorpay **live credentials were never configured**, so no booking can be a genuine captured customer payment. All current bookings (May–Nov 2026) are pre-launch seed/test data. This is authoritative evidence, not inference from date alone.

## 1. Candidate records (DELETE or ARCHIVE)
| Collection | Candidate count | Criteria |
|---|---|---|
| bookings | **100** (39 fullPayment, 25 firstPayment, 36 created) | all pre-launch, no live capture ever |
| users (customers) | **16** (15 `gmail.com` role=user, 1 `ocuser.com`) | non-admin, non-host test accounts |
| enquiries | **15** | pre-launch test enquiries |

Revenue in these (for reference, NOT real income): captured-tagged ₹17,98,708; created/unpaid ₹9,61,005.

## 2. PRESERVE (operational master data — never delete)
| Collection | Keep | Reason |
|---|---|---|
| users (Admin) | 1 | platform admin login |
| users (Host) | 5 | host accounts tied to live trips |
| hosts | 4 | public host profiles |
| trips | 4 | public catalogue |
| categories, banners, coverImages | all | site content |
| paymentSettings | 1 | maintenance/WhatsApp config |
| counters (invoice number) | keep | invoice continuity / audit |
| Seo, teamMembers, coupons | keep | config/master |

## 3. Foreign-key / cascade effects
- bookings reference `userId`, `tripId`. Deleting bookings does NOT touch trips/hosts.
- Deleting the 16 customer users orphans nothing operational (their bookings are also candidates). Do NOT delete Host/Admin users.
- enquiries reference `tripId`/`hostId` (optional) — deleting them doesn't affect trips/hosts.
- No invoice/accounting obligation (no real payments) — but KEEP the invoice `counters` doc so future numbering doesn't collide.

## 4. Recommended approach — ARCHIVE + LAUNCH BASELINE (reversible), not hard delete
Preferred over deletion (prompt §45):
1. Add `isTest: true` to all current bookings/enquiries/customer-users (one tagged update).
2. Set a platform `launchBaselineAt` timestamp in settings.
3. Dashboards + public surfaces exclude `isTest:true` and `< launchBaselineAt`. Analytics already excludes unpaid/test via the eligible filter; add the `isTest`/baseline exclusion for a clean slate.
**Result:** dashboards show zero, records preserved + reversible. No data loss.

### Alternative — HARD DELETE (only if you insist, after backup)
Move candidates to `*_archive` collections or delete, after the backup in §5. Irreversible without restore.

## 5. Backup / restore / rollback (MANDATORY before any destructive step)
1. `mongodump` the full DB to an encrypted, access-controlled location OFF git.
2. `mongorestore` into an **isolated** DB; verify candidate counts match this manifest.
3. Record operator + timestamp. Rollback = `mongorestore` the dump.
(Commands provided at execution time, not run now.)

## 6. Reset tooling design (to build, not run)
- Hard **ENV guard**: refuse unless `RESET_CONFIRM=<token>` + explicit `--scope`.
- **Dry-run default**: prints candidate counts + sample masked docs; `--execute` required to write.
- Per-collection, idempotent, batched; **no wildcard deletes**; writes an audit log.
- For ARCHIVE mode: set flags only (no deletes).

## 7. Expected post-reset counts (archive approach)
- bookings visible on dashboard: **0** (all `isTest`); records retained: 100.
- customers visible: 0 new; retained: 16.
- trips/hosts/categories/settings: unchanged.
- Login, public trip inventory, admin/host access: unaffected.

## 8. Approval gate
Execution requires a separate written OK stating: approach (archive vs delete), exact collections, backup location, operator. **Until then: stop at proposal.**
