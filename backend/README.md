# HelpHive API

Backend for **HelpHive – Smart Domestic Services Marketplace**. Residents find verified helpers
(maids, cooks, cleaners), book them weekly, monthly or one-time, and track attendance through a
door code the helper enters when arriving and leaving. Admins verify helpers and oversee everything.

There is no demo or hardcoded data. Every record is created by real users through the API.
In-app payments are out of scope: bookings show a price, and payment happens outside the app.

**Stack:** Node.js 22 · TypeScript · Express 5 · PostgreSQL (raw SQL) · Zod · JWT · bcrypt · Multer · Vitest

---

## Run it

```bash
cd backend
npm install
npm run create-admin   # first time only: creates the admin account (asks for details)
npm run dev            # http://localhost:4000
```

No database setup is needed. Without `DATABASE_URL`, the API uses **PGlite**, a real PostgreSQL
engine embedded in Node, and stores it in `.data/pglite`. To use a PostgreSQL server instead:

```bash
docker compose up -d
# then in .env:
DATABASE_URL=postgres://helphive:helphive@localhost:5432/helphive
```

The database is stored on the machine running the API. To let teammates test with the same data,
see "Testing with teammates" in the [main README](../README.md).

Migrations run automatically on start. Settings such as the fee, cancellation window and timezone
are in [.env.example](.env.example). Copy it to `.env` to change them. In production you must set
`JWT_SECRET`.

> With PGlite, only one process can open the database at a time. Stop `npm run dev` before running
> `npm run create-admin`.

```bash
npm test           # end-to-end tests on a fresh in-memory Postgres
npm run typecheck
```

---

## Features — a walkthrough

The three roles are **resident**, **worker** (the domestic helper) and **admin**.
SRS references (FR-xx / UC-xx) are shown next to each feature.

### 1. Accounts (FR-01, UC-01)
- Residents and helpers sign up with name, username, email, phone, **building** (from a list the
  admin manages) and password. Residents also enter their flat number.
- Only email providers in `ALLOWED_EMAIL_DOMAINS` are accepted (default `@gmail.com`, `@outlook.com`).
- Log in with **username or email**. You get a token and send it as `Authorization: Bearer <token>`.
- Passwords are hashed with bcrypt, and login/sign-up are rate-limited against password guessing.
- Admin accounts can't sign up. They are created with `npm run create-admin`.
- A deactivated account is locked out immediately, even with a token it already has.

### 2. Helper profile (FR-02, UC-02)
New helpers go through **onboarding**: details → extra services → photo → ID documents. The admin
is notified to verify them only when they finish. A helper manages their own profile:
- **categories** chosen from a fixed list (Cooking, Cleaning, Babysitting…; see `src/lib/catalog.ts`),
  an "about" text and **rate per visit**
- whether they're **accepting new bookings**
- **extra services**: charged per visit (e.g. daily chapatis, ₹180 a visit) or once per booking
  (e.g. event food help, ₹1,200)
- a **profile photo**, served publicly so the website can show it
- **leave**: residents with bookings in that period are notified, and the calendar marks those days as leave

**Profile changes need approval.** Once a helper is verified, edits to their name, categories,
about text, rate, services or photo are queued as a *profile change request*. The admin sees a
before → after view and approves or rejects it with a note. Residents keep seeing the old profile
until it's approved. Leave and "taking new bookings" are availability, not profile, so they apply
immediately.

### 3. Verification (FR-04, UC-05)
- A new helper is **hidden from residents** until an admin verifies them.
- The helper uploads real documents (ID proof, address proof, police verification, or "other" with a
  name they type) as PDF, JPG, PNG or WEBP files. The server checks each file's contents, not just its name.
- Admins see the pending list, open each document, and approve or reject it with a note.
  The helper is notified either way. Uploading again after a rejection sends the profile back for review.

### 4. Search and profiles (FR-03, UC-03, UC-04)
Residents search verified helpers by:
- **text** (name, title or summary)
- **service** (e.g. `chapati`)
- **minimum rating**
- **status**: `available`, `booked` (not taking work) or `leave` (on leave today)
- **free at a time**: e.g. `day=Tue&time=09:00` hides helpers already booked then

A profile shows the houses the helper currently works in with their timings, the extra services,
reviews, average rating, hours worked in the last 30 days and upcoming leave.

### 5. Bookings (FR-05, UC-06, UC-07, UC-08)
- **Plans:** one-time, **weekly** (7 days) or **monthly** (1 month), on the weekdays the resident
  picks (Mon–Fri by default).
- **Price** = visits × rate + extras + convenience fee. `POST /bookings/quote` previews the price
  without saving anything.
- A booking starts as a **request**. The helper sees it under house requests and **accepts or
  rejects** it. The resident is notified.
- **No double booking:** a helper can't accept two overlapping bookings. Booking changes for one
  helper are locked so simultaneous requests can't both succeed.
- **Free cancellation** up to 24 hours before the first visit. Each booking has a `cancellable`
  flag the website can use.
- Plans are automatically marked **completed** after their last day. Requests nobody answered
  **expire** once their start date passes.

### 6. Door-code attendance (the core feature)
- Every booked day gets a random **4-digit door code**. Only the resident sees it.
- The helper asks for the code at the door and enters it to **check in**, then again to **check out**.
- The resident is notified on arrival and departure, with real timestamps.
- After 5 wrong codes, that day's code is **locked**. The resident issues a new one.
- The **attendance calendar** is built from these real check-ins:
  - 🟢 **present**: checked in and out
  - 🔴 **absent**: a visit was booked but never completed
  - 🔵 **leave**: the helper was on leave
- Each booking's detail page also lists every scheduled day: `done`, `inside`, `missed` or `upcoming`.

### 7. Reviews (FR-07)
Residents can rate (1–5★) and review a helper once per booking, after at least one completed visit.
The helper's rating updates immediately.

### 8. Earnings
Helpers see what they earned in any date range: completed visits × (rate + per-visit extras), plus
one-off extras, broken down by house.

### 9. Notifications (FR-08)
In-app notifications for booking requests, confirmations, rejections, cancellations,
check-ins and check-outs, leave, verification results, reviews and complaint updates. Each one
carries a `link` to the page it's about. Admins are alerted about new helpers, new documents,
profile changes and complaints, and the link opens the matching admin tab (e.g. `/admin?tab=changes`).

### 10. Complaints and admin dashboard (FR-09)
- Residents and helpers can raise complaints about a helper or a booking.
- Admins get:
  - live **stats**: users, pending verifications, bookings, open complaints, check-ins today
  - the **daily attendance** of every visit
  - all **bookings**
  - user management (**deactivate / reactivate**)
  - the society's **buildings**
  - **profile change requests** from verified helpers
  - **complaint resolution**, with the person who raised it notified

---

## API reference

All endpoints are under `/api`. Errors always look like
`{ "error": { "code": "...", "message": "...", "details": ... } }`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/meta` | anyone | Buildings, categories and allowed email providers |
| POST | `/auth/register` | anyone | Sign up as `resident` or `worker` |
| POST | `/auth/login` | anyone | `{ login, password }` → token |
| GET / PATCH | `/auth/me` | any | View or update own account (phone, building, flat) |
| POST | `/auth/me/password` | any | Change password |
| GET | `/helpers` | any | Search (`q`, `service`, `minRating`, `status`, `day`+`time`) |
| GET | `/helpers/:idOrSlug` | any | Full profile |
| GET | `/helpers/:id/attendance?month=YYYY-MM` | any | Attendance calendar |
| GET / PATCH | `/worker/profile` | worker | Own profile / edit name, categories, about, rate (queued once verified) |
| PUT | `/worker/services` | worker | Replace extra services (queued once verified) |
| PUT | `/worker/photo` | worker | Upload photo, multipart `file` (queued once verified) |
| PUT | `/worker/availability` | worker | `{ isAccepting }`, applies immediately |
| POST | `/worker/documents` | worker | Upload document (multipart `docType`, `docLabel` for "other", `file`) |
| POST | `/worker/onboarding/complete` | worker | Finish onboarding and send for verification |
| GET | `/worker/documents/:id/file` | worker | View own document |
| POST / DELETE | `/worker/leaves`, `/worker/leaves/:id` | worker | Add or remove upcoming leave |
| GET | `/worker/earnings?from&to` | worker | Earnings by house |
| POST | `/bookings/quote` | resident | Price preview |
| POST | `/bookings` | resident | Request a booking |
| GET | `/bookings?status=` | any | My bookings (admins: all) |
| GET | `/bookings/:id` | participant | Detail and day-by-day schedule |
| POST | `/bookings/:id/cancel` | resident | Cancel (24h rule) |
| POST | `/bookings/:id/accept` · `/reject` | worker | Answer a request |
| POST | `/bookings/:id/review` | resident | Rate the helper |
| GET | `/visits/today` | resident, worker | Today's visits (residents get door codes) |
| POST | `/visits/check-in` · `/check-out` | worker | `{ bookingId, code }` |
| POST | `/visits/new-code` | resident | Issue a fresh door code |
| GET | `/notifications` | any | Latest 50 and unread count |
| POST | `/notifications/:id/read` · `/read-all` | any | Mark read |
| POST / GET | `/complaints` | any | Raise complaints / list mine (admins: all) |
| GET | `/admin/stats` | admin | Dashboard counts |
| GET | `/admin/helpers?verification=` | admin | Helpers and their documents |
| GET | `/admin/documents/:id/file` | admin | Open a document |
| POST | `/admin/helpers/:id/verification` | admin | `{ status: verified \| rejected, note }` |
| GET / PATCH | `/admin/users`, `/admin/users/:id` | admin | List users, activate or deactivate |
| GET | `/admin/profile-changes?status=` | admin | Queued profile edits with current values |
| POST | `/admin/profile-changes/:id` | admin | `{ status: approved \| rejected, note }` |
| POST / DELETE | `/admin/buildings`, `/admin/buildings/:name` | admin | Add or remove a building |
| GET | `/admin/attendance?date=` | admin | Every visit on a date |
| PATCH | `/admin/complaints/:id` | admin | Resolve or dismiss |

Photos are served at `/uploads/photos/<file>` (the `photoUrl` field).

---

## Code layout

```
src/
  index.ts              start the server (migrates the database first)
  app.ts                Express app: middleware and route mounting
  config.ts             every setting, read from .env
  db/
    db.ts               tiny Db interface over PostgreSQL or PGlite
    migrate.ts          runs migrations/*.sql in order
    cli.ts              npm run db:migrate / create-admin
    migrations/001_init.sql   the whole schema, commented
  lib/                  shared helpers: auth, errors and validation, dates, pricing, uploads, notify
  services/             logic used by several routes: bookings, attendance
  routes/               one file per area: auth, helpers, worker, bookings, visits, …
tests/
  e2e.test.ts           one full real-world story through the API
  pricing.test.ts       date and price rules
```

## Not included yet
These need outside services or accounts, so they're left for later:
- password reset by email or SMS OTP, and SMS or push notifications (needs an email/SMS provider)
- cloud file storage such as S3 (files are stored on the server's disk under `UPLOAD_DIR`)
- in-app payments (out of scope by decision)
