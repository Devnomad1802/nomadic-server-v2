# Reviews System — Architecture & Refactor Plan

> Status: **PROPOSAL.** Audit + target design for separating Nomadic Townies
> (brand) reviews from Host reviews and adding manual + Google review support.
> No behavioural code changes until the Google approach (§5) is approved.

## 1. Current state (audit)

There are **already two independent review systems** — they are *not* mixed in
the UI today, but they are informal and lack scoping/source metadata.

### A. Brand reviews — `Reviews` model (`models/reviews.js`)
- Fields: `Title, Name, Review, Job, rating, Profile_Image, Date, status, userId`
- Routes: `POST /api/addReview`, `GET /api/getAllReviews`,
  `POST /api/updateReview`, `DELETE /api/deleteReview`
- Admin-managed (manual) via admin **Reviews** page
  (`Components/Reviews/AddReview|PublishReview|DeleteReview`).
- Consumed by `useGetAllReviewsQuery` on: **HomeV3 / ReviewsV3**, Categorie
  Details, AllPackagesV3, TripDetail, OverviewSwiper.
- **This is the Nomadic Townies brand testimonial system.**

### B. Host/trip reviews — `UserReviews` model (`models/UserReviews.js`)
- Fields: `userId, tripId, hostId, rating, review, name, tripName,
  profileImage, date`
- Routes: `POST /api/addUserReview`, `GET|POST /api/getAllReviewsByHostId/:hostId`,
  `getUserReviews`, `getAllUsersReviews`, `getUserReviewsByHostId/:tripId`
- Consumed by `useGetReviewsByHostIdQuery` on the **Host Detail page only**
  (scoped `find({ hostId })`), plus trip reviews elsewhere.
- Currently **traveller-submitted only** — no admin "add host review".

### Findings
1. Brand vs Host are **already separate collections** and **already
   un-mixed in the UI** (host page never calls `getAllReviews`; homepage never
   calls `getAllReviewsByHostId`). The main gap is that this is by-convention,
   not enforced.
2. `UserReviews` is **one shared collection for both host and trip** reviews
   (disambiguated by `hostId` vs `tripId`). This is the "shared list" smell.
3. **No `source` field** (manual / google / traveller), **no `location`**, and
   **no Google integration** anywhere. No Google API key is configured.
4. No admin UI to add **host** reviews manually.

## 2. Target architecture

Keep **two physically separate collections** (clean entity scoping, zero
cross-contamination by construction):

| Entity | Collection | Surfaces | Sources |
|---|---|---|---|
| **Brand** (Nomadic Townies) | `Reviews` (brand) | Home, About, all-packages, trip, category | manual, google |
| **Host** | `HostReview` (`UserReviews`, host-scoped) | Host Detail, Host Profile, Host Dashboard | manual, google, traveller |

Rules enforced in code:
- Host endpoints **only** read host-scoped reviews; brand endpoints **only**
  read brand reviews. A shared "get everything" endpoint is removed/avoided for
  display.
- Every review carries `source` and `entityType` so origin and scope are
  explicit and queryable.

## 3. Proposed schema changes (additive, backward-compatible)

### Brand `Reviews`
```diff
  Title, Name, Review, Job, rating, Profile_Image, Date, status, userId
+ source:     "manual" | "google"   (default "manual")
+ location:   String
+ tripName:   String                 // optional, distinct from Job
+ googlePlaceId / googleAuthorUrl / externalId   // for cached google reviews
```
Plus a brand-level Google Place reference (env var or a single `Settings` doc):
`BRAND_GOOGLE_PLACE_ID`.

### Host reviews (`UserReviews`)
```diff
  userId, tripId, hostId, rating, review, name, tripName, profileImage, date
+ entityType: "host" | "trip"        (default derived from hostId/tripId)
+ source:     "manual" | "google" | "traveller"   (default "traveller")
+ location:   String
+ externalId / googleAuthorUrl       // for cached google reviews (dedupe)
```

### Host (`hosts.js`)
```diff
+ googlePlaceId:  String   // host's Google Business place id (for fetch)
+ googleReviewUrl: String  // raw URL admin pastes (parsed to placeId)
```

All new fields are optional → **no migration needed**; existing documents and
the live traveller-review flow keep working unchanged.

## 4. Display priority / combining (manual + google)

Per entity, the display list = **manual ∪ google ∪ traveller**, deduped by
`externalId`, sorted by: pinned/manual first (optional `priority` int), then
`date` desc. New hosts (no Google reviews) show manual/traveller; established
hosts can lean on Google. Average rating recomputed over the combined set.

## 5. Google reviews — approach, feasibility & limitations

**Hard limitations (must decide before building):**
1. **Volume:** Google **Places Details** returns at most **5 reviews** per
   place, no pagination — you cannot fetch "all" Google reviews via the
   official API.
2. **Auth/cost:** requires a **Place ID** + a **billing-enabled Google API
   key**. None exists in this project today.
3. **Terms of Service:**
   - Place IDs may be stored indefinitely, but **other Places content
     (review text, author, photo) may only be cached short-term** — long-term
     storage of review bodies violates Google's ToS.
   - Google requires **attribution** ("Reviews from Google", author link).
     The task's requirement *"do not display another company's business name"*
     is about not surfacing a *competing brand*, which is fine — but fully
     stripping **Google's** required attribution can violate ToS. Flagging this
     conflict explicitly.
4. Reviewer **profile photos** are hotlink URLs that can expire.

**Recommended approach — two tiers:**

- **Tier 1 (recommended, ship now, no key, ToS-safe): Manual-cached Google
  reviews.** Admin pastes the Google place URL (stored for reference) and adds
  the specific Google reviews they want to feature as entries with
  `source:"google"` (name, rating, text, photo, date). Full editorial control,
  no API cost, no caching-ToS issue, works for both brand and per host.

- **Tier 2 (optional, needs your go-ahead): Live Places API fetch.** A server
  endpoint resolves `placeId` from the pasted URL, calls Places Details
  (≤5 reviews), caches with a short TTL (ToS-compliant), and serves them per
  entity behind a feature flag. **Requires:** you provision a Google Places API
  key + billing, and we keep Google attribution. Disabled automatically if no
  key is present.

If Tier 2's constraints (5-review cap, attribution, billing) aren't acceptable,
Tier 1 is the best alternative and what I recommend implementing first.

## 6. API surface (proposed)

```
# Brand (admin-managed; existing + extend)
GET    /api/getAllReviews?source=         # public read, brand only
POST   /api/addReview                     # +source/location/tripName
PATCH  /api/reviews/:id  DELETE ...        # (existing update/delete)

# Host
GET    /api/getAllReviewsByHostId/:hostId # public read, host only (exists)
POST   /api/addUserReview                 # traveller (exists; source=traveller)
POST   /api/host/:id/reviews              # NEW: admin manual host review
DELETE /api/host/:id/reviews/:reviewId    # NEW: admin manage

# Google (Tier 2, feature-flagged)
POST   /api/google-reviews/resolve        # url -> placeId (+preview)
GET    /api/google-reviews?placeId=       # cached fetch (≤5), short TTL
```

## 7. Rollout
1. Additive schema fields (brand + host + Host.googlePlaceId) — no migration.
2. Enforce scoping in controllers; backfill `entityType`/`source` defaults.
3. Admin: manual **host** review management + `source`/`location` on brand.
4. Client: host page merges host reviews (manual+google+traveller); brand
   surfaces unchanged (already brand-only).
5. Google Tier 1 (manual-cached) — or Tier 2 if approved + key provided.

## 8. Backward-compatibility / safety
- All schema changes additive/optional.
- Existing traveller review flow, brand testimonials, and all current review
  surfaces keep working unchanged.
- No shared "all reviews" list used for display; scoping enforced server-side.
