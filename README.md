# HelpHive — Smart Domestic Services Marketplace

Residents find verified domestic helpers, book them one-time, weekly or monthly, and track
attendance through a door code the helper enters when arriving and leaving. Admins verify helpers
and oversee everything.

```
HelpHive/
  frontend/   the website: React + TanStack Start + Tailwind
  backend/    the API: Node + Express + PostgreSQL (full feature guide in backend/README.md)
```

## Tech stack

- **Frontend:** React 19, TanStack Start, TanStack Router, Vite, TypeScript, and Tailwind CSS
- **UI and interaction:** Radix UI primitives, Lucide icons, React Hook Form, date-fns, Recharts, and Sonner notifications
- **Backend:** Node.js 22+, TypeScript, Express 5, REST API routes, raw SQL migrations, and shared service modules
- **Validation and security:** Zod validation, JWT authentication, bcrypt password hashing, Helmet security headers, CORS, and express-rate-limit
- **Database:** PostgreSQL in production or shared environments, with PGlite providing a local file-backed PostgreSQL database
- **File handling:** Multer for profile photos and verification documents, stored locally under `backend/.data/uploads`
- **Development and deployment:** Docker Compose for PostgreSQL, environment-based configuration, Vite API proxying, and Cloudflare Tunnel support for remote testing
- **Testing and quality:** Vitest and Supertest for backend tests, TypeScript typechecking, ESLint, and Prettier

### Built-in capabilities

- Role-based accounts for residents, domestic helpers, and administrators
- Helper onboarding, document uploads, profile verification, profile-change approvals, and availability management
- Helper search with service, rating, availability, and schedule filters
- One-time, weekly, and monthly bookings with price quotes, cancellation rules, and double-booking protection
- Door-code check-in and check-out with attendance calendars, leave tracking, and visit status history
- In-app notifications, reviews, earnings tracking, complaints, building management, and admin dashboards

## Run it locally

You need **Node.js 22 or newer** (check with `node --version`). Use two terminals.

**1. API**

```bash
cd backend
npm install
npm run create-admin
npm run dev
```

`create-admin` is only needed the first time, and only while the API is stopped. The API runs
on http://localhost:4000.

**2. Website**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:8080**. The website's dev server forwards `/api` and `/uploads` to the
backend on port 4000, so the browser only ever uses this one address. See
[frontend/.env.example](frontend/.env.example) to point it somewhere else.

## Run it on another laptop

Each laptop runs its own copy with its **own, empty database**.

1. Copy the project **without** these folders and files:
   - `frontend/node_modules` and `backend/node_modules`: reinstalled by `npm install`
   - `backend/.data`: your database and uploaded files
   - `backend/.env`: your secret key. Without it, the backend uses safe development defaults.
2. Install Node.js 22+, then follow **Run it locally** above, including `npm run create-admin`.
3. Log in as that admin, add buildings, and create test accounts.

## Try it
1. Log in as the **admin** at http://localhost:8080/login. Under **Buildings**, add your society's
   buildings; people pick one when signing up.
2. Sign out, then sign up as a **domestic helper** (with a Gmail or Outlook address) and complete the onboarding steps.
3. Log in as the **admin** again. The alert takes you to **Verification**, where you verify the helper.
4. Sign up as a **resident**, find the helper under **Find helpers**, and send a booking request.
5. As the helper, accept it under **House requests**.
6. On the visit day, the resident's dashboard shows the **door code**. The helper enters it on their
   dashboard to check in and out, and the attendance calendar turns green.

## Where the data lives

Everything (accounts, bookings, attendance) is stored in a database **on the computer running the
backend**: `backend/.data/pglite`. Uploaded photos and documents are in `backend/.data/uploads`.

- Another laptop running its own copy starts with an **empty** database, so your logins won't
  work there.
- To start over, stop the backend and delete `backend/.data`.

## Testing with teammates

Both of you use **one** running copy, on the laptop that has the data.

**On the host laptop** (the one running both terminals):

1. Connect both laptops to the same Wi-Fi or phone hotspot. College Wi-Fi often blocks
   laptops from reaching each other; a phone hotspot almost always works.
2. Find your address. In a terminal, run `ipconfig` and copy the Wi-Fi **IPv4 Address**,
   e.g. `192.168.1.20`.
3. Let Windows accept connections. When Node.js first starts, Windows asks whether to allow it
   through the firewall. Tick the network type you're on and click **Allow**. If the Wi-Fi is set
   to *Public*, either switch it to *Private* (Settings → Network & internet → Wi-Fi → your network)
   or allow Node.js on Public networks (Windows Security → Firewall → Allow an app through firewall).

**On the teammate's laptop:** open `http://<host-address>:8080`, e.g. `http://192.168.1.20:8080`.
Only port 8080 is needed, because the website forwards API calls to the backend.
Nothing needs installing. She can log in with the same usernames and passwords, or create new
accounts, and everything is shared live.

Each browser keeps its own login, so you can be the admin while your teammate is a resident or a
helper at the same time. That's handy for testing door-code check-ins.

> The host laptop must stay on, with both terminals running. Your address may change when you
> reconnect to Wi-Fi, so check `ipconfig` again if the link stops working.

**Not on the same network?** Give the host's site a temporary public address with a tunnel. Only
use this for short testing sessions, and keep a `JWT_SECRET` set in `backend/.env`.
Install [Cloudflare's `cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
then run `cloudflared tunnel --url http://localhost:8080` and share the `https://….trycloudflare.com`
address it prints. The address changes each time you run it.

**Alternative: a shared online database.** Both laptops can use one hosted PostgreSQL database
(e.g. a free Neon or Supabase project) by setting `DATABASE_URL` in `backend/.env`. Accounts and
bookings are then shared, but uploaded photos and documents stay on the laptop that received them.

## Frontend layout

```
frontend/src/
  lib/api.ts        fetch wrapper: base URL, login token, error messages
  lib/hooks.ts      useApi (load data), useAction (make a change), session helpers
  lib/types.ts      shapes of the API's data
  lib/format.ts     money, date and time formatting
  components/       AppShell (login guard + navigation), calendar, door-code cards, …
  routes/           one file per page
```

The backend layout is described in [backend/README.md](backend/README.md).
