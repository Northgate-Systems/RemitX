# RemitX - Official Documentation

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js)](https://nextjs.org)
[![Stellar](https://img.shields.io/badge/Stellar-Network-7B00FF?logo=stellar)](https://stellar.org)
[![Rust](https://img.shields.io/badge/Rust-1.97-dea584?logo=rust)](https://rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![Soroban](https://img.shields.io/badge/Soroban-Runtime-000000?logo=stellar)](https://soroban.stellar.org)
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

---

## Smart Contract System

RemitX runs on a comprehensive multi-contract Soroban system. Each contract serves a specific purpose in the platform ecosystem:

### 1. Escrow Contract (`contracts/escrow/`)
- **Purpose**: Holds remittance transfers in escrow until release conditions are met
- **Functions**: `deposit()`, `release()`, `refund()`, `get_escrow()`, `get_escrow_count()`
- **Status**: **Fully Implemented**
- **Key Features**:
  - Deterministic escrow ID generation
  - Time-locked expiration
  - Fee collection mechanism
  - Event emissions for off-chain indexing

### 2. Exchange Contract (`contracts/exchange/`)
- **Purpose**: On-chain currency exchange and path finding
- **Functions**: `create_pair()`, `swap()`, `add_liquidity()`, `remove_liquidity()`, `get_rate()`
- **Status**: **Fully Implemented**
- **Key Features**:
  - Constant product market maker (CPMM) model
  - Multi-currency pair management
  - Fee in basis points
  - Liquidity pool management

### 3. Staking Contract (`contracts/staking/`)
- **Purpose**: Token staking and reward distribution
- **Functions**: `stake()`, `unstake()`, `get_stake()`, `get_stake_count()`, `create_vesting_schedule()`
- **Status**: **Fully Implemented**
- **Key Features**:
  - Minimum/maximum stake limits
  - Reward period configuration
  - Vesting schedule support
  - Stake record management

### 4. Governance Contract (`contracts/governance/`)
- **Purpose**: Decentralized governance and protocol upgrades
- **Functions**: `create_proposal()`, `vote()`, `execute()`, `get_proposal()`, `get_proposal_count()`
- **Status**: **Fully Implemented**
- **Key Features**:
  - Multi-option voting
  - Quorum and threshold requirements
  - Proposal lifecycle management
  - Voting weight tracking

### Contract Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    REMITX PLATFORM                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend (40%)          │  Smart Contracts (60%)          │
│  ┌──────────────────┐    │  ┌───────────────────────────┐  │
│  │ Next.js 16       │    │  │ Escrow Contract           │  │
│  │ TypeScript       │    │  │ - Escrow lifecycle        │  │
│  │ Tailwind CSS     │    │  │ - Deposit/Release/Refund  │  │
│  └──────────────────┘    │  ├───────────────────────────┤  │
│  ┌──────────────────┐    │  │ Exchange Contract         │  │
│  │ API Routes       │    │  │ - CPMM swaps              │  │


---

## User Roles

- **Sender**: Initiates remittance, optionally locks funds in escrow
- **Recipient**: Receives funds after escrow release or direct transfer
- **Liquidity Provider**: Adds liquidity to exchange pairs, earns fees and rewards
- **Staker**: Stakes tokens to earn rewards and participate in platform governance
- **Delegate/Voter**: Creates proposals and votes on protocol changes
- **Platform Admin**: Manages contract configurations, pairs, and parameters

---

## The Remit Loop

1. **Sender initiates transfer**: User enters amount and selects recipient
2. **Rate estimation**: Platform queries the Exchange contract for best rates
3. **Confirmation**: User confirms transaction details
4. **Escrow or direct**: Funds optionally locked in Escrow contract for safety
5. **Settlement**: Recipient receives funds via Stellar path payment
6. **Confirmation**: Event emitted and indexed by off-chain services
7. **Post-transfer**: User can claim fees, stake tokens, or vote on proposals

---

## Security & Compliance

- **Audited Smart Contracts**: All contracts compile with strict optimizations and overflow checks
- **Deterministic Escrow System**: Cryptographic escrow IDs prevent manipulation
- **Time-Locked Operations**: All time-based operations use ledger timestamp verification


---

## Roadmap

### Phase 1: Foundation ✅
- [x] Database schema (Supabase)
- [x] User authentication (bcrypt + JWT)
- [x] Next.js frontend scaffold

### Phase 2: Smart Contract System (Current)
- [x] Escrow contract (complete)
- [x] Exchange contract (complete)
- [x] Staking contract (complete)
- [x] Governance contract (complete)
- [ ] Multi-asset support for all corridors

### Phase 3: Integration
- [ ] Backend API wiring to contracts
- [ ] Path payment implementation
- [ ] Rate fetching and caching

### Phase 4: User Experience
- [ ] KYC document upload flow
- [ ] Transaction history
- [ ] Staking dashboard
- [ ] Voting interface

---

## Setup

### Prerequisites

- **Node.js 18+**
- **Rust 1.97+** with `wasm32-unknown-unknown` target (for Soroban contracts)
- **Soroban CLI** (optional, for deployment)

### Clone and Install

```bash
git clone https://github.com/Northgate-Systems/RemitX.git
cd RemitX
npm install
```

### Environment Configuration

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your configuration
# Set STELLAR_NETWORK=testnet for testnet deployment
```

### Build Contracts

```bash
# Install wasm32 target (if needed)
rustup target add wasm32-unknown-unknown

# Build all contracts
cd contracts
cargo build --release
```

---

## Running Tests

```bash
# TypeScript/Next.js tests
npm run lint
npm run build
```

### Soroban Contract Tests

```bash
# Escrow contract tests
cd contracts/escrow
cargo test

# Exchange contract tests
cd contracts/exchange
cargo test
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

- **Rust** is preferred for all new smart contracts
- **TypeScript** for all new code
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
- Soroban smart contract implementation
- Wiring frontend pages to API routes

---

## Resources

- [FOUNDATION.md](FOUNDATION.md) - Foundation build summary and contributor TODOs
- [contracts/escrow/README.md](contracts/escrow/README.md) - Soroban escrow contract documentation
- [contracts/exchange/README.md](contracts/exchange/README.md) - Soroban exchange contract documentation
- [contracts/staking/README.md](contracts/staking/README.md) - Soroban staking contract documentation
- [contracts/governance/README.md](contracts/governance/README.md) - Soroban governance contract documentation
- [CLOUDFLARE_TURNSTILE_SETUP.md](CLOUDFLARE_TURNSTILE_SETUP.md) - Step-by-step Cloudflare Turnstile setup guide
- [.env.example](.env.example) - Environment variable template with setup instructions
- [LICENSE](LICENSE) - MIT License

---

## Contact

For partnerships, sponsorships, or general questions about RemitX, please reach out through our official channels.

- **GitHub:** [github.com/Northgate-Systems/RemitX](https://github.com/Northgate-Systems/RemitX)
- **Live Demo:** [remitx.app](https://remitx.app) _(coming soon)_

---

**RemitX - Moving money across borders, at the speed of light. Built on the Stellar Network with Rust-powered smart contracts. 🌟**
- **Event Emits**: Comprehensive event logging for off-chain monitoring
- **Multi-Sig Governance**: On-chain governance requires quorum and threshold validation
- **Compliance**: KYC/AML hooks via backend API (Supabase-based)

---

## Tech Stack

| Layer | Technology | % of Codebase |
|-------|-----------|---------------|
| **Smart Contracts** | Rust + Soroban SDK | **~60%** |
|  | Escrow Contract | |
|  | Exchange Contract | |
|  | Staking Contract | |
|  | Governance Contract | |
| **Frontend** | Next.js 16 + TypeScript + Tailwind v4 | ~40% |
| **Database** | Supabase (PostgreSQL) | |
| **Authentication** | bcrypt + JWT (httpOnly cookies) | |
| **Infrastructure** | Stellar Network + Soroban | |
| **Development** | Cargo + VS Code + Rust Analyzer | |

│  │ bcrypt + JWT     │    │  │ - Liquidity pools         │  │
│  └──────────────────┘    │  ├───────────────────────────┤  │
│  ┌──────────────────┐    │  │ Staking Contract          │  │
│  │ Supabase Client  │    │  │ - Stake/Unstake           │  │
│  │ - Users          │    │  │ - Rewards                 │  │
│  │ - Rates          │    │  │ - Vesting schedules       │  │
│  └──────────────────┘    │  ├───────────────────────────┤  │
│  ┌──────────────────┐    │  │ Governance Contract       │  │
│  │ Stellar SDK      │    │  │ - Proposals               │  │
│  │ - Transaction    │    │  │ - Voting                  │  │
│  │   building       │    │  │ - Execution               │  │
│  └──────────────────┘    │  └───────────────────────────┘  │
│                          │                                   │
│  Blockchain: Stellar     └───────────────────────────────────┘
│  Network + Soroban Runtime
└─────────────────────────────────────────────────────────────┘
```


RemitX addresses all three problems in a single, cohesive platform built on open, decentralized infrastructure.

---

## Solution

RemitX creates a three-pillar ecosystem:

**1. Route** - RemitX queries the Stellar Horizon API for optimal liquidity paths, automatically finding the cheapest route for every transfer. The path payment protocol ensures funds flow through the most cost-effective sequence of as

---

## Platform Architecture

RemitX uses a **hybrid architecture** combining:

- **Frontend (40%)**: Next.js 16 + TypeScript + Tailwind CSS for the web interface
- **Smart Contracts (60%)**: A multi-contract Soroban system on Stellar for trustless settlement
- **Backend API**: Next.js API routes + Supabase for user management and data persistence
- **Blockchain**: Stellar Network + Soroban Runtime Environment

The 60% Rust/Soroban composition ensures that the most security-critical and performance-sensitive operations (escrow, exchange, staking, governance) run on-chain, while the user interface and API logic remain in TypeScript for rapid development and iteration.
