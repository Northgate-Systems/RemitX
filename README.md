<div align="center">

# 🌍 RemitX

### Cross-Border Remittance Routing Protocol on the Stellar Network

**Send money across borders in seconds — not days. RemitX intelligently routes funds through the most cost-effective payment paths on Stellar, comparing anchor fees in real time to guarantee the best exchange rates for corridors spanning Nigeria (NGN), the Philippines (PHP), the United Kingdom (GBP), and the United States (USD).**

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js&style=for-the-badge)](https://nextjs.org)
[![Stellar](https://img.shields.io/badge/Stellar-Network-7B00FF?logo=stellar&style=for-the-badge)](https://stellar.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&style=for-the-badge)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&style=for-the-badge)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&style=for-the-badge)](https://prisma.io)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

**✨ Live Demo** — [remitx.app](https://remitx.app) _(coming soon)_

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup](#database-setup)
  - [Running the Application](#running-the-application)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Smart Contract (Soroban Escrow)](#-smart-contract-soroban-escrow)
- [Security](#-security)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Overview

RemitX is a **mobile-first decentralized application (dApp)** built on the **Stellar Network** that revolutionizes cross-border remittances. By leveraging Stellar's lightning-fast settlement layer and path payment protocol, RemitX delivers:

| Capability | Description |
|---|---|
| ⚡ **Sub-5 Second Settlement** | Transactions finalize in seconds, not the 3–5 business days typical of traditional banking |
| 💱 **Path Payment Router** | Queries Stellar Horizon for optimal liquidity paths, automatically finding the cheapest route |
| 🏦 **Anchor Fee Comparison** | Real-time side-by-side comparison of SEP-24 anchor off-ramp fees |
| 📊 **DEX Rate Monitor** | Live Stellar DEX rate tracking with configurable threshold alerts |
| 🔒 **Bank-Grade Security** | bcrypt password hashing, JWT session authentication, Cloudflare Turnstile bot protection |
| 🧩 **Soroban Smart Contracts** | Optional escrow layer via Rust-based Soroban contracts for added safety |

---

## ✨ Key Features

### 🌐 Multi-Corridor Support
Real-time liquidity across USD, NGN, GBP, PHP, EUR, and more — with a curated directory of vetted SEP-24 anchors for each corridor.

### 🔍 Intelligent Rate Engine
A zero-cost, keyless rate engine that aggregates live prices from **CoinGecko** (crypto) and **ExchangeRate-API** (150+ fiat currencies), with a 5-minute in-memory cache and graceful fallback rates when APIs are unreachable.

### 📱 Mobile-First Experience
A responsive, animated interface built with Tailwind CSS 4 and Framer Motion, optimized for the way people actually send money — on their phones.

### 🛡️ Enterprise-Grade Authentication
- bcrypt password hashing (12 salt rounds)
- JWT sessions in httpOnly, secure cookies
- Cloudflare Turnstile bot verification on login and registration
- Route-level middleware protection for all authenticated pages

### 🧩 Optional Escrow Protection
A Soroban smart contract that can hold transfers in escrow until a release condition is met — giving senders a safety net if something goes wrong.

---

## 🛠️ Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org) (App Router) | React framework with SSR, SSG, and server components |
| [React 19](https://react.dev) | UI component library |
| [TypeScript 5](https://typescriptlang.org) | Type-safe development |
| [Tailwind CSS 4](https://tailwindcss.com) | Utility-first styling |
| [Framer Motion](https://framermotion.framer.website) | Page & component animations |
| [Lucide React](https://lucide.dev) | Icon system |

### Backend & Blockchain

| Technology | Purpose |
|---|---|
| [Stellar Network](https://stellar.org) | Blockchain settlement layer |
| [Stellar Horizon](https://developers.stellar.org/api/horizon) | Blockchain API & path payments |
| [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk) | Stellar SDK for transactions & accounts |
| [SEP-24](https://stellar.org/protocol/sep-24) | Anchor off-ramp standard |
| [Soroban](https://soroban.stellar.org) | Smart contract platform (Rust) |

### Data & Infrastructure

| Technology | Purpose |
|---|---|
| [Prisma 7](https://prisma.io) | Type-safe ORM with PostgreSQL adapter |
| [Supabase Postgres](https://supabase.com) | Managed PostgreSQL database |
| [Zod](https://zod.dev) | Runtime schema validation for all API routes |
| [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) | Bot verification |
| [Vercel](https://vercel.com) | Deployment platform |

---

## 🏗️ Architecture

RemitX follows a **Next.js App Router** architecture with a clean separation between public and authenticated routes, server-side data fetching, and direct Stellar Horizon integration.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Next.js 16)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────────┐   │
│  │ Landing  │  │ Dashboard│  │  Send / Routes / Anchors / Rates │   │
│  │  Page    │  │          │  │  Review / Activity / Support     │   │
│  └──────────┘  └──────────┘  └──────────────────────────────────┘   │
│                      │              │                                │
│              ┌───────┴───────┐      │                                │
│              │  Middleware   │      │                                │
│              │  (JWT Auth)   │      │                                │
│              └───────┬───────┘      │                                │
└──────────────────────┼──────────────┼───────────────────────────────┘
                       │              │
              ┌────────┴────────┐     │
              │  API Routes     │     │
              │  /api/auth      │     │
              │  /api/stellar   │     │
              │  /api/anchors   │     │
              │  /api/transactions│    │
              └────────┬────────┘     │
                       │              │
        ┌──────────────┼──────────────┼──────────────┐
        │              │              │              │
┌───────┴───────┐ ┌────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
│  Supabase     │ │ Stellar  │ │  Rate     │ │  Soroban    │
│  Postgres     │ │ Horizon  │ │  Engine   │ │  Escrow     │
│  (Prisma)     │ │  API     │ │  (Free)   │ │  Contract   │
└───────────────┘ └──────────┘ └───────────┘ └─────────────┘
```

### Key Design Decisions

- **App Router** — Next.js 16 App Router for nested layouts, server components, and route groups.
- **Route Groups** — The `(app)` route group wraps all authenticated pages with a shared layout (Header + Sidebar).
- **Middleware Protection** — `src/middleware.ts` verifies JWT sessions on every request, redirecting unauthenticated users to `/login` and returning `401` for protected API routes.
- **Server-Side Data** — Prisma queries and Stellar SDK calls run server-side in API routes, keeping secrets out of the browser.
- **Zero-Cost Rate Engine** — Live rates from free public APIs with in-memory caching — no API keys, no database, no external service required.
- **Type-Safe Validation** — Every API route validates input with Zod schemas before processing.
- **Mobile-First** — Responsive design with Tailwind breakpoints, optimized for mobile wallets.

---

## 🚦 Getting Started

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

Open `.env` and follow the **6 numbered steps** embedded in the file. Each step includes precise instructions:

| Step | Variable(s) | What to do |
|---|---|---|
| **1** | `STELLAR_NETWORK`, `STELLAR_HORIZON_URL` | Leave as-is for testnet development |
| **2** | `STELLAR_USDC_ISSUER`, `STELLAR_EURC_ISSUER` | Add issuer public keys for non-XLM assets (optional for dev) |
| **3** | `DATABASE_URL` | Get your `postgresql://` connection string from Supabase |
| **4** | `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| **5** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Get from Cloudflare Turnstile dashboard (optional for dev) |
| **6** | `NEXT_PUBLIC_APP_URL` | Set to `http://localhost:3000` for local dev |

### Database Setup

Once `DATABASE_URL` is configured in `.env`:

```bash
# For a fresh development database (creates tables from schema)
npx prisma db push

# OR for an existing database with migrations
npx prisma migrate deploy

# Generate the Prisma client (runs automatically on npm install)
npx prisma generate
```

> **⚠️ Important:** In your Supabase project, enable **"Enforce Foreign Keys"** under *Project Settings → Database*. Supabase has this off by default on some plans, and the Prisma schema relies on it.

### Running the Application

```bash
# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The app will automatically:
- Connect to the Stellar testnet (funded via Friendbot)
- Use your Supabase Postgres database
- Skip Turnstile verification if keys aren't set (dev mode)

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Build the application for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint across the codebase |
| `npx prisma studio` | Open Prisma Studio to inspect the database |
| `npx prisma db push` | Sync the Prisma schema to the database |
| `npx prisma migrate deploy` | Apply database migrations |

---

## 🔐 Environment Variables

All environment variables are documented in `.env.example` with step-by-step setup instructions. Here's the complete reference:

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | ✅ | `testnet` | Stellar network: `testnet` (dev) or `public` (mainnet — real funds!) |
| `STELLAR_HORIZON_URL` | ✅ | `https://horizon-testnet.stellar.org` | Horizon API endpoint for the configured network |
| `STELLAR_USDC_ISSUER` | ⚠️ | — | Public key of the USDC issuing account (required for USDC corridors) |
| `STELLAR_EURC_ISSUER` | ⚠️ | — | Public key of the EURC issuing account (required for EURC corridors) |
| `DATABASE_URL` | ✅ | — | `postgresql://` connection string for Supabase Postgres |
| `JWT_SECRET` | ✅ | — | Secret for signing session JWTs. Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ⚠️ | — | Cloudflare Turnstile site key (public, shipped to browser) |
| `TURNSTILE_SECRET_KEY` | ⚠️ | — | Cloudflare Turnstile secret key (server-only) |
| `NEXT_PUBLIC_APP_URL` | ✅ | `http://localhost:3000` | Public URL the app is served from |

> **Legend:** ✅ Required · ⚠️ Required for production / specific features

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create a new user account | Public |
| `POST` | `/api/auth/login` | Authenticate and create a session | Public |
| `POST` | `/api/auth/logout` | Destroy the current session | Session |
| `GET` | `/api/auth/me` | Get the current authenticated user | Session |

### Stellar

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/stellar/account` | Create a Stellar testnet account (Friendbot) | Session |
| `GET` | `/api/stellar/rate` | Fetch a live exchange rate | Session |
| `POST` | `/api/stellar/send` | Build a path payment transaction | Session |
| `POST` | `/api/stellar/submit` | Submit a signed transaction to Horizon | Session |

### Data

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/anchors` | List SEP-24 anchors with fee comparison | Session |
| `GET` | `/api/transactions` | List the user's transaction history | Session |
| `GET` | `/api/public/*` | Public endpoints (rates, network status) | Public |

---

## 📁 Project Structure

```
RemitX/
├── contracts/
│   └── escrow/                  # Soroban smart contract (Rust)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs           # deposit / release / refund / get_escrow
│           └── test.rs          # Unit tests
├── prisma/
│   └── schema.prisma            # Database schema (User, Transaction, Rate, Escrow)
├── public/                      # Static assets
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (app)/               # Authenticated route group
│   │   │   ├── activity/        # Transaction history
│   │   │   ├── anchors/         # Anchor comparison & management
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── rates/           # DEX rate monitor
│   │   │   ├── review/          # Transaction review & confirmation
│   │   │   ├── routes/          # Path payment routing
│   │   │   ├── send/            # Send money flow
│   │   │   ├── support/         # Support center
│   │   │   └── layout.tsx       # Authenticated layout (Header + Sidebar)
│   │   ├── api/                 # API routes
│   │   │   ├── anchors/         # Anchor directory endpoints
│   │   │   ├── auth/            # Register / login / logout / me
│   │   │   ├── public/          # Public endpoints
│   │   │   ├── stellar/         # Account / rate / send / submit
│   │   │   └── transactions/    # Transaction history
│   │   ├── legal/               # Legal pages (dynamic [slug])
│   │   ├── login/               # Login & registration page
│   │   ├── globals.css          # Global styles & Tailwind
│   │   ├── layout.tsx           # Root layout (metadata, fonts)
│   │   └── page.tsx             # Landing page
│   ├── components/              # Shared UI components
│   │   ├── Header.tsx           # App header / navigation
│   │   ├── Sidebar.tsx          # App sidebar navigation
│   │   └── TurnstileWidget.tsx  # Cloudflare Turnstile widget
│   ├── generated/               # Generated Prisma client
│   ├── lib/                     # Core libraries
│   │   ├── anchors.ts           # Curated SEP-24 anchor directory
│   │   ├── api-response.ts      # Standardized API response helpers
│   │   ├── auth.ts              # Password hashing & session management
│   │   ├── db.ts                # Prisma singleton client
│   │   ├── jwt.ts               # JWT verification (middleware-safe)
│   │   ├── rates.ts             # Live rate engine (CoinGecko + ExchangeRate-API)
│   │   ├── stellar.ts           # Stellar SDK integration
│   │   ├── turnstile.ts         # Cloudflare Turnstile verification
│   │   └── validations.ts       # Zod validation schemas
│   └── middleware.ts            # JWT session protection
├── .env.example                 # Environment template with instructions
├── .gitignore
├── eslint.config.mjs            # ESLint configuration
├── next.config.ts               # Next.js configuration
├── package.json
├── postcss.config.mjs           # PostCSS configuration
├── prisma.config.ts             # Prisma configuration
├── tsconfig.json                # TypeScript configuration
├── vercel.json                  # Vercel deployment configuration
└── README.md
```

---

## 🧩 Smart Contract (Soroban Escrow)

The `contracts/escrow/` directory contains a **Soroban smart contract** that provides optional escrow protection for remittance transfers.

### Contract Interface

| Function | Status | Description |
|---|---|---|
| `deposit(sender, recipient, amount, asset, expires_at)` | 🚧 Stub | Locks funds in escrow, returns escrow ID |
| `release(escrow_id)` | 🚧 Stub | Releases funds to recipient |
| `refund(escrow_id)` | 🚧 Stub | Refunds funds to sender after expiry |
| `get_escrow(escrow_id)` | ✅ Implemented | Read-only state getter |

### Open Design Question

The **release authorization mechanism** is deliberately left as an open design decision. Candidate approaches include:

1. **Backend-signed authorization** — simplest, works with existing app flow
2. **Multi-sig (sender + recipient)** — truly decentralized, but requires both parties online
3. **Oracle / timelock hybrid** — best UX, most complex

See [`contracts/escrow/README.md`](contracts/escrow/README.md) for the full discussion.

### Build & Test

```bash
cd contracts/escrow
cargo build
cargo test
```

---

## 🛡️ Security

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
| **Network Safety** | Testnet by default — mainnet requires explicit opt-in |

---

## 🚀 Deployment

### Deploying to Vercel

1. Push your repository to GitHub
2. Import it into [Vercel](https://vercel.com)
3. Add all environment variables from `.env` in **Project Settings → Environment Variables**
4. Deploy — `vercel.json` is already configured for Next.js

### Production Checklist

- [ ] Set `STELLAR_NETWORK=public` and `STELLAR_HORIZON_URL=https://horizon.stellar.org` *(only after audit)*
- [ ] Configure real asset issuers (`STELLAR_USDC_ISSUER`, etc.)
- [ ] Set Cloudflare Turnstile keys
- [ ] Generate a fresh `JWT_SECRET`
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Run `npx prisma migrate deploy` against the production database
- [ ] Enable "Enforce Foreign Keys" in Supabase

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

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

Check the [`FOUNDATION.md`](FOUNDATION.md) file — it contains a complete list of `// TODO(contributor)` markers with clear descriptions of what needs to be implemented, including:

- Real Stellar transaction building and submission
- Live Horizon rate fetching with database caching
- KYC document upload and verification flow
- Soroban escrow contract implementation
- Wiring frontend pages to API routes

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

**Built on the [Stellar Network](https://stellar.org) 🌟**

*RemitX — Moving money across borders, at the speed of light.*

</div>