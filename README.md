# RemitX - Official Documentation

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js)](https://nextjs.org)
[![Stellar](https://img.shields.io/badge/Stellar-Network-7B00FF?logo=stellar)](https://stellar.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built_on-Stellar-7B00FF?logo=stellar)](https://stellar.org)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](CONTRIBUTING.md)

**Moving money across borders, at the speed of light.**

---

## Table of Contents

- [Introduction](#introduction)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Platform Architecture](#platform-architecture)
- [Smart Contract System](#smart-contract-system)
- [User Roles](#user-roles)
- [The Remit Loop](#the-remit-loop)
- [Security & Compliance](#security--compliance)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Contributing](#contributing)
- [Resources](#resources)
- [Contact](#contact)

---

## Introduction

**RemitX** is a mobile-first decentralized application (dApp) built on the **Stellar Network** that revolutionizes cross-border remittances. By leveraging Stellar's lightning-fast settlement layer and path payment protocol, RemitX intelligently routes funds through the most cost-effective payment paths, comparing anchor fees in real time to guarantee the best exchange rates for corridors spanning Nigeria (NGN), the Philippines (PHP), the United Kingdom (GBP), and the United States (USD).

RemitX is designed for the millions of people who send money home every month - the diaspora workers, the gig economy earners, the families supporting loved ones across borders. Traditional remittance channels charge exorbitant fees and take days to settle. RemitX delivers **sub-5-second settlement** at a **fraction of the cost**, powered by the Stellar Network's decentralized infrastructure.

---

## Problem Statement

Cross-border remittances are a $700+ billion annual market, yet the people who depend on them most are served worst. Three core problems define the gap:

**Exorbitant Fees** - Traditional remittance providers charge 5–10% per transaction. For a worker sending $200 home each month, that's $10–$20 lost to intermediaries every single time. Over a year, that's a significant portion of their earnings.

**Slow Settlement** - International wire transfers take 3–5 business days to clear. When a family needs money for an emergency - a medical bill, school fees, a repair - waiting days is not an option.

**Opaque Pricing** - Exchange rates are hidden in the spread. Users rarely know the true cost of their transfer until it's too late. There is no transparent, side-by-side comparison of what different providers actually charge.

RemitX addresses all three problems in a single, cohesive platform built on open, decentralized infrastructure.

---

## Solution

RemitX creates a three-pillar ecosystem:

**1. Route** - RemitX queries the Stellar Horizon API for optimal liquidity paths, automatically finding the cheapest route for every transfer. The path payment protocol ensures funds flow through the most cost-effective sequence of assets and markets.

**2. Compare** - A curated directory of vetted SEP-24 anchors provides real-time, side-by-side fee comparison. Users see exactly what each anchor charges before they commit - no hidden spreads, no surprise deductions.

**3. Settle** - Transactions finalize on the Stellar Network in seconds, not days. Funds move directly from sender to recipient through the decentralized ledger, with optional escrow protection via Soroban smart contracts for added safety.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          REMITX (Next.js 16)                        │
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│   │  SEND    │───▶│  ROUTE   │───▶│ COMPARE  │───▶│ SETTLE   │     │
│   │          │    │          │    │          │    │          │     │
│   │ Amount   │    │ Path     │    │ Anchor   │    │ Stellar  │     │
│   │ Currency │    │ Payment  │    │ Fees     │    │ Horizon  │     │
│   │ Recipient│    │ Router   │    │ Side-by- │    │ Submit   │     │
│   │          │    │          │    │ Side     │    │ Escrow   │     │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                  MIDDLEWARE (JWT AUTH)                   │       │
│   │   Protects all authenticated routes · Verifies sessions │       │
│   └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                    API ROUTES                            │       │
│   │   /api/auth · /api/stellar · /api/anchors ·             │       │
│   │   /api/transactions · /api/public                        │       │
│   └─────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────┴───────┐     ┌───────┴───────┐     ┌───────┴───────┐
│   Supabase    │     │   Stellar     │     │   Rate        │
│   Postgres    │     │   Horizon     │     │   Engine      │
│  (@supabase/  │     │   API         │     │   (Free)      │
│  supabase-js) │     │               │     │               │
│               │     │               │     │               │
│  Users        │     │  Path         │     │  CoinGecko    │
│  Transactions │     │  Payments     │     │  ExchangeRate │
│  Rates        │     │  Accounts     │     │  -API         │
│  Escrows      │     │  Balances     │     │  150+ Fiat    │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## Smart Contract System

RemitX includes an optional **Soroban escrow contract** that provides a safety net for remittance transfers. When a user sends money, the funds can be locked in escrow instead of being sent directly to the recipient - if something goes wrong (wrong address, delivery failure), the funds can be recovered after expiry.

### Contract Interface

| Function | Status | Description |
|---|---|---|
| `deposit(sender, recipient, amount, asset, expires_at)` | 🚧 Stub | Locks funds in escrow, returns escrow ID |
| `release(escrow_id)` | 🚧 Stub | Releases funds to recipient |
| `refund(escrow_id)` | 🚧 Stub | Refunds funds to sender after expiry |
| `get_escrow(escrow_id)` | ✅ Implemented | Read-only state getter |

### Open Design Question: What should authorize `release()`?

This is the most important unresolved issue and should be turned into a standalone GitHub issue.

#### Candidate Approaches

**1. Backend-signed authorization (simplest)** - The RemitX backend holds a signing key. When the sender confirms the transaction, the backend signs a release message and submits it to the contract. The contract verifies the backend's public key.

*Pros:* Simple, works with the existing app flow, no extra on-chain complexity.
*Cons:* Centralized - the backend has unilateral control over fund release.

**2. Multi-sig (sender + recipient both sign)** - Both the sender and recipient must authorize the release. The contract verifies both signatures.

*Pros:* Truly decentralized - neither party can unilaterally control funds.
*Cons:* Requires both parties to be online and cooperative. If the recipient disappears, funds are stuck until expiry.

**3. Oracle / timelock hybrid** - A time lock releases funds automatically after the delivery window expires, OR an oracle (e.g., confirming fiat settlement via an anchor) can release early.

*Pros:* Best UX - funds always land somewhere.
*Cons:* Most complex. Requires an oracle integration and careful edge-case handling.

See [`contracts/escrow/README.md`](contracts/escrow/README.md) for the full discussion.

---

## User Roles

### Sender
- Creates an account and connects a Stellar wallet
- Selects the send amount, source currency, and destination corridor
- Reviews real-time anchor fee comparisons before committing
- Confirms the transfer - funds settle on Stellar in seconds
- Optionally enables escrow protection for added safety

### Recipient
- Receives funds directly to their Stellar wallet
- Off-ramps through their preferred SEP-24 anchor
- Tracks incoming transfers in real time
- No account required to receive - just a Stellar public key

### Anchor
- Listed in the curated SEP-24 anchor directory
- Fee schedules displayed transparently to users
- Settlement times published for comparison
- Onboarded and audited before appearing in the directory

### Developer / Contributor
- Extends the platform via the documented API routes
- Implements new corridors and asset issuers
- Contributes to the Soroban escrow contract
- Builds on the open-source codebase

---

## The Remit Loop

RemitX's flywheel is designed so that every transfer compounds the platform's value:

```
Send Money
     │
     ▼
Route Through Cheapest Path
     │
     ▼
Compare Anchor Fees ──▶ Best Rate Guaranteed
     │
     ▼
Settle on Stellar (Sub-5 Seconds)
     │
     ▼
Recipient Off-Ramps via SEP-24 Anchor
     │
     ▼
Trust & Volume Grow ──▶ More Anchors Onboard ──▶ Better Rates ──▶ Loop Continues
```

The more people use RemitX, the more anchors compete for their business, the better the rates become, and the more people switch from traditional remittance channels. **Speed is not the feature - the network effect is.**

---

## Security & Compliance

RemitX implements defense-in-depth security practices:

| Layer | Protection |
|---|---|
| **Authentication** | bcrypt password hashing (12 rounds), JWT sessions in httpOnly cookies |
| **Bot Protection** | Cloudflare Turnstile on login and registration |
| **Route Protection** | Middleware-level JWT verification on all authenticated routes |
| **Input Validation** | Zod schema validation on every API route |
| **Data Isolation** | All queries filtered by `userId` from the verified JWT |
| **Secret Management** | Environment variables git-ignored, never committed |
| **Cookie Security** | `httpOnly`, `secure` (production), `sameSite: lax` |
| **Network Safety** | Testnet by default - mainnet requires explicit opt-in after audit |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Blockchain** | Stellar Network |
| **Smart Contracts** | Rust (Stellar Soroban) |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Database** | Supabase Postgres via `@supabase/supabase-js` |
| **Validation** | Zod |
| **Authentication** | bcrypt + JWT (httpOnly cookies) |
| **Bot Protection** | Cloudflare Turnstile |
| **Rate Engine** | CoinGecko + ExchangeRate-API (free, keyless) |
| **Deployment** | Vercel |

---

## Roadmap

### V1 - Foundation (Current Phase)

- ✅ Supabase schema with 4 tables (users, transactions, rates, escrows) — see `supabase-schema.sql`
- ✅ Full authentication flow (register, login, logout, session)
- ✅ Middleware route protection
- ✅ Live rate engine (CoinGecko + ExchangeRate-API)
- ✅ Curated SEP-24 anchor directory
- ✅ Stellar SDK integration (account creation, path payments, submission)
- ✅ Cloudflare Turnstile bot protection
- ✅ Soroban escrow contract scaffold

### V2 - Growth

- 🚧 Wire frontend pages to live API routes
- 🚧 Implement KYC document upload and verification flow
- 🚧 Complete Soroban escrow contract (deposit, release, refund)
- 🚧 Live Horizon rate fetching with database caching
- 🚧 Transaction history with real data
- 🚧 Dashboard with real balances and analytics

### V3 - Scale

- 🎯 Mainnet deployment (after security audit)
- 🎯 Additional corridors (XAF, XOF, GHS, KES, ZAR)
- 🎯 Mobile wallet integration (Freighter)
- 🎯 Corporate remittance API
- 🎯 Cross-chain support

---

## Setup

### Prerequisites

| Requirement | Version |
|---|---|
| [Node.js](https://nodejs.org) | ≥ 18 |
| [npm](https://npmjs.com) | ≥ 9 (or pnpm / yarn) |
| [Supabase](https://supabase.com) account | Free tier is sufficient |
| [Cloudflare](https://cloudflare.com) account | For Turnstile (optional for dev) |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Northgate-Systems/RemitX.git
cd RemitX

# 2. Install dependencies
npm install

# 3. Copy the environment template
cp .env.example .env
```

### Environment Configuration

Open `.env` and follow the **6 numbered steps** embedded in the file:

| Step | Variable(s) | What to do |
|---|---|---|
| **1** | `STELLAR_NETWORK`, `STELLAR_HORIZON_URL` | Leave as-is for testnet development |
| **2** | `STELLAR_USDC_ISSUER`, `STELLAR_EURC_ISSUER` | Add issuer public keys for non-XLM assets (optional for dev) |
| **3** | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Get both from Supabase Project Settings → API |
| **4** | `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| **5** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Get from Cloudflare Turnstile dashboard (optional for dev) |
| **6** | `NEXT_PUBLIC_APP_URL` | Set to `http://localhost:3000` for local dev |

### Database Setup

Open the Supabase dashboard for your project → **SQL Editor** → paste the
entire contents of `supabase-schema.sql` (in the project root) → **Run**.
That creates all 4 tables, the enum types, indexes, and the `updatedAt`
triggers in one shot. Re-run it any time it changes — every statement uses
`IF NOT EXISTS` / `CREATE OR REPLACE` so it's safe to run more than once.

### Running the Application

```bash
# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The app will automatically:
- Connect to the Stellar testnet (funded via Friendbot)
- Query your Supabase Postgres database via the Supabase JS client
- Skip Turnstile verification if keys aren't set (dev mode)

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Build the application for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint across the codebase |
| Supabase Table Editor | Inspect/edit rows directly in the Supabase dashboard |

---

## Running Tests

### Prerequisites

1. **Install Rust and Stellar CLI** (for Soroban contract tests):

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   npm install -g @stellar/stellar-cli
   ```

2. **Configure Environment:**

   ```bash
   # Copy the environment template
   cp .env.example .env

   # Edit .env with your configuration
   # Set STELLAR_NETWORK=testnet for testnet deployment
   ```

### Run Tests

```bash
npm run lint              # Run ESLint across the codebase
npm run build             # Verify the production build compiles
```

### Soroban Contract Tests

```bash
cd contracts/escrow
cargo build               # Build the contract
cargo test                # Run contract unit tests
```

### Lint and Format Contracts

Before submitting a PR, ensure Rust contracts pass formatting and lint checks:

```bash
cargo fmt --all               # auto-format all contracts
cargo fmt --all -- --check    # check formatting without modifying files
cargo clippy --workspace -- -D warnings  # lint all contracts (warnings are errors)
```

---

## Contributing

RemitX is an open-source project and welcomes contributions from developers, designers, and community builders. If you believe in affordable, instant cross-border payments and want to help build the infrastructure for the next generation of global finance, we would love to have you.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for the current claim flow, expected turnaround, PR checklist, and bounty/grant notes.

### Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/<your-username>/RemitX.git`
3. **Create** a feature branch: `git checkout -b feature/amazing-feature`
4. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
5. **Push** to the branch: `git push origin feature/amazing-feature`
6. **Open** a Pull Request

### Development Guidelines

- Use **TypeScript** for all new code
- Follow the existing component and file structure
- Run `npm run lint` before committing
- Validate all API inputs with **Zod**
- Test on both **desktop and mobile** viewports
- Keep environment variables documented in `.env.example`

### Looking for a place to start?

Use the current codebase and this README as the source of truth, then check [`FOUNDATION.md`](FOUNDATION.md) for the intentionally stubbed areas and the full list of `// TODO(contributor)` markers, including:

- Real Stellar transaction building and submission
- Live Horizon rate fetching with database caching
- KYC document upload and verification flow
- Soroban escrow contract implementation
- Wiring frontend pages to API routes

---

## Resources

- [FOUNDATION.md](FOUNDATION.md) - Foundation build summary and contributor TODOs
- [contracts/escrow/README.md](contracts/escrow/README.md) - Soroban escrow contract documentation
- [CLOUDFLARE_TURNSTILE_SETUP.md](CLOUDFLARE_TURNSTILE_SETUP.md) - Step-by-step Cloudflare Turnstile setup guide
- [.env.example](.env.example) - Environment variable template with setup instructions
- [LICENSE](LICENSE) - MIT License

---

## Contact

For partnerships, sponsorships, or general questions about RemitX, please reach out through our official channels.

- **GitHub:** [github.com/Northgate-Systems/RemitX](https://github.com/Northgate-Systems/RemitX)
- **Live Demo:** [remitx.app](https://remitx.app) _(coming soon)_

---

**RemitX - Moving money across borders, at the speed of light. Built on the Stellar Network. 🌟**
## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
