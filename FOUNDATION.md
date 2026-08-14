# RemitX Foundation Build — Summary

This document summarizes what was built during the foundation phase, what's left as intentional stubs for contributors, and every `// TODO(contributor)` left in the codebase.

## ✅ Fully Working

### Phase 2 — Data Layer
- **Prisma schema** with 4 models: `User`, `Transaction`, `Rate`, `Escrow`
- Models include proper enums, relations, indexes, and CockroachDB-compatible defaults
- Prisma Client generated to `src/generated/prisma/`
- Singleton `db` client in `src/lib/db.ts` with `@prisma/adapter-pg`

### Phase 3 — Auth
- **API routes:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- bcrypt password hashing + JWT in httpOnly cookies
- **Middleware** (`src/middleware.ts`) protects all `src/app/(app)/*` routes, redirects to `/login`
- **Login page** at `/login` with toggle between sign-in and registration
- All routes filter by `userId` from the verified JWT
- `kycStatus` field exists but no KYC flow — `// TODO(contributor): implement KYC document upload/verification flow`

## 🧩 Stubs for Contributors

### Phase 4 — Stellar Integration (API route skeletons)
These routes have correct function signatures, Zod validation, user auth, and Stellar SDK setup — but the actual Horizon/transaction logic is stubbed:

| Route | Status | File |
|-------|--------|------|
| `POST /api/stellar/account` | Signature + zod done. TODO: real keypair + Friendbot | `src/app/api/stellar/account/route.ts` |
| `GET /api/stellar/rate` | Signature + zod done. TODO: live Horizon quote + caching | `src/app/api/stellar/rate/route.ts` |
| `POST /api/stellar/send` | Signature + zod done. TODO: build real XDR | `src/app/api/stellar/send/route.ts` |
| `POST /api/stellar/submit` | Signature + zod done. TODO: submit to Horizon | `src/app/api/stellar/submit/route.ts` |

The underlying Stellar SDK functions in `src/lib/stellar.ts` are also stubbed with mock responses and clear TODOs.

### Phase 5 — Soroban Escrow Contract
- **Location:** `contracts/escrow/`
- **Structure:** Standard Soroban project (`Cargo.toml`, `src/lib.rs`, `src/test.rs`)
- **What's implemented:** `get_escrow()` — fully works, simple storage read
- **What's stubbed:** `deposit()` (token transfer + escrow ID gen), `release()` (authorization mechanism), `refund()` (time-check + transfer)
- **Open design question:** What authorizes `release()`? See `contracts/escrow/README.md` for candidate approaches. Deliberately unresolved.
- **Not deployed** — scaffold only

### Frontend Pages (not wired)
All four app pages are static/mocked:
- `src/app/(app)/send/page.tsx`
- `src/app/(app)/review/page.tsx`
- `src/app/(app)/activity/page.tsx`
- `src/app/(app)/dashboard/page.tsx`

Each has a `// TODO(contributor)` comment describing exactly what needs to be wired.

## 📋 All `// TODO(contributor)` Locations

| # | File | TODO |
|---|------|------|
| 1 | `src/lib/stellar.ts:33` | Implement `createTestnetAccount()` — generate keypair, fund via Friendbot |
| 2 | `src/lib/stellar.ts:62` | Implement Horizon polling/streaming for stuck pending transactions |
| 3 | `src/lib/stellar.ts:69` | Implement `fetchRate()` — live Horizon path-payment quote + caching |
| 4 | `src/lib/stellar.ts:80` | Implement `buildSendTransaction()` — load account, build XDR, check balance |
| 5 | `src/lib/stellar.ts:98` | Implement `submitTransaction()` — parse XDR, submit to Horizon, handle errors |
| 6 | `src/app/api/stellar/account/route.ts:16` | Real keypair gen + Friendbot + store publicKey |
| 7 | `src/app/api/stellar/rate/route.ts:33` | Real Horizon rate fetch + Rate table caching |
| 8 | `src/app/api/stellar/send/route.ts:45` | Real rate → XDR build → DB store + balance check |
| 9 | `src/app/api/stellar/submit/route.ts:48` | Real Horizon submit + status update + Escrow record |
| 10 | `src/app/(app)/send/page.tsx:7` | Replace hardcoded rate with API call, wire "Continue" to POST /api/stellar/send |
| 11 | `src/app/(app)/review/page.tsx:10` | Replace `setTimeout` fake with real signing + POST /api/stellar/submit |
| 12 | `src/app/(app)/activity/page.tsx:8` | Replace hardcoded rows with GET /api/transactions |
| 13 | `src/app/(app)/dashboard/page.tsx:9` | Replace hardcoded numbers with real balance + transaction count |
| 14 | `src/` (various files) | Implement KYC document upload/verification flow (kyc_status field exists) |
| 15 | `contracts/escrow/src/lib.rs:deposit()` | Implement token transfer + escrow ID generation |
| 16 | `contracts/escrow/src/lib.rs:release()` | Decide on + implement authorization mechanism |
| 17 | `contracts/escrow/src/lib.rs:refund()` | Implement time-check + token transfer |
| 18 | `contracts/escrow/src/test.rs:1` | Write Soroban unit tests |

## 📐 Tech Stack (Corrected)

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 16, TypeScript, Tailwind v4 | UI complete, no API wiring |
| **Auth** | bcrypt + JWT (httpOnly cookies) | Fully working |
| **Database** | CockroachDB via Prisma | Schema + client ready |
| **Stellar SDK** | `@stellar/stellar-sdk` | Imported + typed, routes stubbed |
| **Soroban** | Rust + `soroban-sdk` | Contract scaffolded, `deposit/release/refund` stubbed |
| **Validation** | Zod | Every API route validated |
| **Deployment** | Vercel | Configured + building |