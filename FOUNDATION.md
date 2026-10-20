# RemitX Foundation Build - Summary

This document summarizes what was built during the foundation phase, what's left as intentional stubs for contributors, and every `// TODO(contributor)` left in the codebase.

## ✅ Fully Working

### Phase 2 - Data Layer
- **Supabase schema** (`supabase-schema.sql`) with 4 tables: `users`, `transactions`, `rates`, `escrows`
- Tables include proper enum types, indexes, foreign keys, and `updatedAt` triggers
- Hand-written row types in `src/lib/types.ts` (no ORM/codegen)
- Singleton `supabase` client in `src/lib/supabase.ts` using `@supabase/supabase-js` with the service role key

### Phase 3 - Auth
- **API routes:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- bcrypt password hashing + JWT in httpOnly cookies
- **Middleware** (`src/middleware.ts`) protects all `src/app/(app)/*` routes, redirects to `/login`
- **Login page** at `/login` with toggle between sign-in and registration
- All routes filter by `userId` from the verified JWT
- `kycStatus` field exists but no KYC flow - `// TODO(contributor): implement KYC document upload/verification flow`

### Phase 5 - Soroban Contracts (Escrow, Exchange, Staking, Governance)
All four contracts are **fully implemented** against `soroban-sdk` 22 and compile + pass their unit tests (`cargo test --workspace`: 44 passing, 0 failing):
- **Escrow** (`contracts/escrow/`): `deposit` / `release` / `refund` - token transfer, deterministic escrow IDs, platform-authorised release, expiry refunds. 11 tests.
- **Exchange** (`contracts/exchange/`): constant-product AMM - `create_pair`, `add/remove_liquidity`, `swap` (fee + slippage guard), `get_rate`, order-insensitive pair IDs. 13 tests.
- **Staking** (`contracts/staking/`): `stake` / `withdraw` / `claim_rewards`, continuous APR accrual, admin-gated `set_apr`, `fund_rewards`. 9 tests.
- **Governance** (`contracts/governance/`): `propose` / `vote` / `execute`, token-balance voting weight, 4% quorum on a supply snapshot, majority-yes, double-vote protection. 11 tests.
- **Shared types** (`contracts/src/`): common enums/structs (`types.rs`, `tokens.rs`).
- **Not deployed** - builds and tests locally only.

## 🧩 Stubs for Contributors

### Phase 4 - Stellar Integration (API route skeletons)
These routes have correct function signatures, Zod validation, user auth, and Stellar SDK setup - but the actual Horizon/transaction logic is stubbed:

| Route | Status | File |
|-------|--------|------|
| `POST /api/stellar/account` | Signature + zod done. TODO: real keypair + Friendbot | `src/app/api/stellar/account/route.ts` |
| `GET /api/stellar/rate` | Signature + zod done. TODO: live Horizon quote + caching | `src/app/api/stellar/rate/route.ts` |
| `POST /api/stellar/send` | Signature + zod done. TODO: build real XDR | `src/app/api/stellar/send/route.ts` |
| `POST /api/stellar/submit` | Signature + zod done. TODO: submit to Horizon | `src/app/api/stellar/submit/route.ts` |

The underlying Stellar SDK functions in `src/lib/stellar.ts` are also stubbed with mock responses and clear TODOs.

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
| 1 | `src/lib/stellar.ts:33` | Implement `createTestnetAccount()` - generate keypair, fund via Friendbot |
| 2 | `src/lib/stellar.ts:62` | Implement Horizon polling/streaming for stuck pending transactions |
| 3 | `src/lib/stellar.ts:69` | Implement `fetchRate()` - live Horizon path-payment quote + caching |
| 4 | `src/lib/stellar.ts:80` | Implement `buildSendTransaction()` - load account, build XDR, check balance |
| 5 | `src/lib/stellar.ts:98` | Implement `submitTransaction()` - parse XDR, submit to Horizon, handle errors |
| 6 | `src/app/api/stellar/account/route.ts:16` | Real keypair gen + Friendbot + store publicKey |
| 7 | `src/app/api/stellar/rate/route.ts:33` | Real Horizon rate fetch + Rate table caching |
| 8 | `src/app/api/stellar/send/route.ts:45` | Real rate → XDR build → DB store + balance check |
| 9 | `src/app/api/stellar/submit/route.ts:48` | Real Horizon submit + status update + Escrow record |
| 10 | `src/app/(app)/send/page.tsx:7` | Replace hardcoded rate with API call, wire "Continue" to POST /api/stellar/send |
| 11 | `src/app/(app)/review/page.tsx:10` | Replace `setTimeout` fake with real signing + POST /api/stellar/submit |
| 12 | `src/app/(app)/activity/page.tsx:8` | Replace hardcoded rows with GET /api/transactions |
| 13 | `src/app/(app)/dashboard/page.tsx:9` | Replace hardcoded numbers with real balance + transaction count |
| 14 | `src/` (various files) | Implement KYC document upload/verification flow (kyc_status field exists) |
| ~~15~~ | `contracts/escrow/src/lib.rs:deposit()` | ✅ Done - token transfer + escrow ID generation implemented |
| ~~16~~ | `contracts/escrow/src/lib.rs:release()` | ✅ Done - platform `require_auth` authorization implemented |
| ~~17~~ | `contracts/escrow/src/lib.rs:refund()` | ✅ Done - expiry check + token transfer implemented |
| ~~18~~ | `contracts/escrow/src/test.rs` | ✅ Done - 11 escrow tests (44 across the workspace) |

## 📊 Rust LOC vs. 60% Target

README (§Tech Stack and §Solution) states Smart Contracts should be **~60% of the codebase**.
Measured on the authored source tree - excluding `node_modules`, build output, and the
auto-generated Prisma client (`src/generated/`, ~7.4k lines) - as of this foundation build:

| Bucket | Physical lines | Non-blank |
|--------|---------------:|----------:|
| Rust smart contracts (`contracts/**/*.rs`) | 2,620 | 2,253 |
| App source (TS/TSX/JS/CSS/SQL, excl. generated) | 8,280 | 7,485 |
| _Prisma-generated (excluded from share)_ | _8,078_ | _7,392_ |

**Rust share = ~24% (physical) / ~23% (non-blank)** - against the 60% target.

Rust breakdown (non-blank lines):

| Unit | Implementation | Tests | Total |
|------|---------------:|------:|------:|
| escrow | 228 | 220 | 448 |
| exchange | 343 | 256 | 599 |
| governance | 287 | 236 | 523 |
| staking | 293 | 189 | 482 |
| shared (`contracts/src/`) | 201 | - | 201 |
| **Total** | **1,352** | **901** | **2,253** |

To reach 60% of the authored codebase, Rust would need to be ~11,200 non-blank lines
(`0.6 / 0.4 x 7,485`), i.e. roughly **5x** the current contract surface (~9k more lines),
or the TypeScript surface would have to shrink. This is a composition/aspiration metric,
not a correctness issue - the current gap is recorded here for transparency.

## 📐 Tech Stack (Corrected)

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 16, TypeScript, Tailwind v4 | UI complete, no API wiring |
| **Auth** | bcrypt + JWT (httpOnly cookies) | Fully working |
| **Database** | Supabase Postgres via `@supabase/supabase-js` | Schema + client ready |
| **Stellar SDK** | `@stellar/stellar-sdk` | Imported + typed, routes stubbed |
| **Soroban** | Rust + `soroban-sdk` 22 | 4 contracts fully implemented + 44 unit tests passing |
| **Validation** | Zod | Every API route validated |
| **Deployment** | Vercel | Configured + building |