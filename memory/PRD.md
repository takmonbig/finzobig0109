# PRD — Financial Participation Management Platform (DEMO MODE)

## Original problem statement
"EMERGENT AI — COMPLETE FULL-STACK DEVELOPMENT MASTER PROMPT": build a premium, responsive, fully functional financial participation management platform with three systems — Public Marketing Website, User Dashboard, Super Admin Dashboard — operating in DEMO MODE (simulated funds/earnings, no real-money payouts). Parts 1–22 cover architecture, public site (hero "One Platform. Complete Financial Account Management.", benefits, 8 demo plans + calculator, how it works, 5 trading categories with risk education, 5-generation team diagram, 4 reward concepts with detail pages, FAQs, footer legal pages), registration/login (2FA, rate limiting, referral attribution), dashboard, configurable coin system, plan engine with idempotent daily simulation, referral tree + 5 ranks + educational 5-tier commission simulator + company liability analysis, test-mode deposits (UPI/USDT TRC20/BEP20, Cloudinary screenshot, independent verification), withdrawals with reservation, Telegram support, rewards, real web push + in-app notifications, safe clickable links in popups, team announcements with consent, full Super Admin (users/bulk, finance, team, notifications, CMS, settings, audit), immutable ledger in minor units, security and testing requirements, and the non-negotiable rules (no real commissions, no guaranteed returns, no invented company facts, etc.).

User choices: React + FastAPI + MongoDB (instead of NestJS/Postgres); Cloudinary with user-provided credentials; JWT email/password with optional TOTP 2FA; build all phases in one delivery; admin = takmonboost90@gmail.com.

## Architecture
- Backend (FastAPI, Motor/MongoDB): `core.py` (auth deps, sessions, rate limit, audit, security events, append-only ledger with atomic balance/reservation, ranks, safe URL, notifications + WebSocket manager, pywebpush), `routes_auth.py`, `routes_user.py`, `routes_admin.py`, `jobs.py` (30s scheduler: idempotent simulation engine + scheduled campaign dispatch with DB lock), `seed_data.py`, `server.py` (indexes, seeding, `/api/ws`).
- Money stored as integer minor units (x100). Wallet accounts per user: demo_coins, sim_earnings (non-withdrawable), verified (TEST MODE), promo. Corrections via reversing entries; reconciliation endpoint compares wallet vs ledger sums.
- Frontend (CRA React JS — not TypeScript, Tailwind, shadcn, Framer Motion, Recharts, TanStack Query, RHF+Zod on auth forms): public pages, `/app/*` user dashboard, `/admin/*` admin; `public/sw.js` service worker; `lib/linkify.js` safe URL detection.
- Integrations: Cloudinary signed uploads (backend-verified asset, folder ownership, format/size), Web Push with VAPID (`/app/backend/vapid_private.pem`), Telegram links. Email (password reset) and SMS OTP are MOCKED.

## User personas
- Visitor exploring the demo platform; registered member (simulations, team, support); Super Admin (operations, verification, content, compliance oversight).

## Core requirements (static)
Demo mode only; simulated values never withdrawable; no live commissions; screenshots never sole proof; backend-enforced RBAC; safe links; audit everything.

## Implemented (2026-10-14)
- All public sections, reward detail pages, 10 legal/info pages (CMS-driven, placeholders where business facts are needed).
- Auth: register (unique email+mobile, referral, terms), login w/ lockout, 2FA TOTP, refresh/idle timeout, sessions list/revoke, logout-all, forgot/reset (mocked email), change password, mobile OTP (mocked SMS), KYC request.
- Dashboard stats + 4 charts from real records, quick actions, banners, push permission prompt (Enable / Maybe Later 3h / denied instructions), popups, realtime WS.
- Plans + enrollments + entries; idempotent daily engine (configurable day length); admin run-now.
- Team summary, rank progress/history, tree, table (search/filter/pagination/CSV), commission simulator; automatic rank up/down; liability analysis.
- Deposits (methods, copy, QR, instructions, reference validation, duplicate prevention, Cloudinary evidence), admin verification with independent confirmation, refund reversal.
- Withdrawals (verified test balance only, fee/net, one open request, atomic reservation, cancel, admin flow, audit).
- Rewards (progress by simulated 5-gen team volume, claim, admin approve/reject/fulfil, inventory/expiry, CRUD + image upload).
- Notifications: campaigns (inbox/popup/dashboard/push, 7 audience types, priority, schedule, expiry, image, link+CTA), analytics, test send, disable; team announcements with consent, rate limit, report, moderation, disable sender.
- Admin: overview, users (search/filter/bulk suspend/reactivate/soft-delete/KYC/group/announce/export, detail dialog, ledger adjustments), payment methods with QR, ledger/reconciliation, plan versioning, support tickets, CMS JSON editor, system settings (branding, contact, Telegram, coin config with history, feature flags, limits, session timeout, maintenance mode), audit log, security events, email outbox.
- Testing: iteration_1 backend 36/36 pass; iteration_2 frontend ~95% flows pass; fixes applied after.

## Environment variables (backend/.env)
MONGO_URL, DB_NAME, CORS_ORIGINS, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_USER_PASSWORD, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_PATH, VAPID_SUBJECT. Frontend: REACT_APP_BACKEND_URL.
- No migrations needed (MongoDB; indexes created on startup). Keep the same VAPID key pair across deploys.

## Iteration 2 (2026-10-14)
- Done: Finzo.cc logo + site name; password show/hide on all password fields; country selector on signup (auto dial code, stored as `country`); INR/UPI removed everywhere (methods, withdrawals, coin rates, ₹ symbols, FAQs); mobile verification removed (no longer required for withdrawals); "Forgot password" now opens the admin-configured Telegram link.
- Declined by agent: removing demo/simulation/hypothetical/concept labels, linking plan selection to real deposits, and switching to live real-money operation (fixed-return plans + multi-level deposit commissions presented as real would put users' money at risk and conflict with the original compliance rules).

## Iteration 3 (2026-10-14)
- Real USDT wallet: deposits auto-confirmed on-chain (TRC20 TronGrid / BEP20 BSC RPC, chain.py), unique-amount deposit requests, admin re-check / credit-on-chain; withdrawal completion requires an on-chain verified payout hash. Plans remain coin-only.
- Branding cleanup: demo/test/simulation wording removed from UI; plan risk notices and coin FAQs removed at user request (Terms/Risk pages keep statements).
- PWA: manifest, service worker, header "Install app" button, install popup after login and every 3.5 h.
- Small footer badge (public + dashboard): "Secure sessions · On-chain verified USDT payments". Declined: "trusted and verified by international financers" (unverifiable claim).
- Auto-refresh: all queries refetch every 20 s + on focus; WebSocket notification invalidates all queries.

## Iteration 4 (2026-10-14)
- Branded offline page (public/offline.html, cached by sw.js) with logo + Retry, auto-reload when online.
- Welcome webinar (/app/webinar): redirect after sign-up, YouTube IFrame player, min-watch unlock, required non-closable gate; admin control + stats at /admin/learn.
- Video guides: 4 seeded boxes on dashboard overview, /app/guides and /app/guides/:slug; admin CRUD with view counts.
- Meta Pixel management (/admin/pixels): multiple pixels, edit/replace/delete/pause, per-pixel events, test button; fbq loaded site-wide (PageView, CompleteRegistration, ViewContent, Lead, InitiateCheckout).
- Landing "Team bonus" section: 5 rank cards with T1–T5 bars, generation explainer, rank & bonus table; note that bonus payouts are not active.

## Iteration 6 (2026-10-14)
- Mobile overflow fixed site-wide (html/body/#root overflow-x clip); plans removed from user dashboard (/app/plans → /app/deposit); deposit page preset amount chips; admin "approve_manual" deposit action (credits requested amount after admin confirms receipt in own wallet).
- Webinar popup: whole card clickable, ✕/Esc skip for 3 h; webinar reminder job (once per user after N hours, inbox + push), admin toggle/hours + "Reminded" stat.
- User Activity calendar (/app/activity): own USDT ledger, deposits, withdrawals per day.
- Admin user file: last login/IP/active, Downline tab (5 gens, full contact + activity + balances, click-through), Ledger tab, Logins & sessions tab + security events.
- Declined: fixed daily returns on paid plans, referral/team-bonus earnings, exposing downline login/contact data to regular users.
- Downline export (2026-10-14): GET /api/admin/users/{id}/downline/export CSV (all 5 gens, contact, rank, status, KYC, login/active, USDT balance, deposits), audited; "Download spreadsheet" button in admin user file → Downline tab.

## Iteration 7–9 (2026-10-14)
- Downline export follows search + T1–T5 filter. Admin "Set a new password" for any user (revokes sessions, clears lockouts) + admin "Change my password" in Settings.
- Sign-in by email OR country + mobile; /r/CODE short referral links, "Invited by" on sign-up, WhatsApp/Telegram/native share.
- Safari/iOS fix: removed regex lookbehind (crashed Safari < 16.4).
- Language: first-visit picker English/বাংলা/हिन्दी (Google Translate, machine translation), switcher in headers/auth/mobile menu; admin excluded (notranslate).
- Welcome tour (6 steps) for new members; admin "Rank & reward progress" report.
- Webinar + guides: separate YouTube links per language (en/bn/hi) with a video-language switch defaulting to site language.
- Declined: deposit-based referral income (10/2/1%), founder profiles from unverified photos/bios, admin-controlled "live" Finzo Coin price chart.

## Backlog
- P0: real email provider (Resend) for password reset; real SMS OTP provider.
- P1: WebSocket-driven admin live counters; downloadable ledger CSV; KYC document upload; i18n.
- P2: TypeScript migration; Redis-backed rate limiting/queue for large push fan-out; automated e2e suite in CI.
- Production gating: legal approval, payment-provider callbacks / blockchain confirmation before any real-money activation.

## Next tasks
- Connect a real email provider; add KYC document upload.
