# RemitX — Cross-Border Remittance Routing Protocol

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js)](https://nextjs.org)
[![Stellar](https://img.shields.io/badge/Stellar-Network-7B00FF?logo=stellar)](https://stellar.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**RemitX** is a mobile-first dApp built on the **Stellar Network** that optimises cross-border payments. It intelligently routes funds through the most cost-effective payment paths and compares anchor fees to ensure users get the best exchange rates for corridors like Nigeria (NGN), Philippines (PHP), UK (GBP), and USA (USD).

> **Live Demo** — [remitx.app](https://remitx.app) _(placeholder)_

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Routes](#routes)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

RemitX leverages the Stellar Network to deliver instant cross-border settlements with significantly lower fees than traditional banking. The platform provides:

- **Path Payment Router** — Queries Stellar Horizon for optimal liquidity paths.
- **Anchor Comparison** — Real-time fee comparison for SEP-24 off-ramps.
- **DEX Monitor** — Real-time rate tracking and threshold alerts.
- **Soroban Ready** — Smart contract extension support via Soroban.

---

## Features

| Feature | Description |
|---|---|
| 🌐 **Multi-Corridor Support** | USD, NGN, GBP, PHP with real-time liquidity |
| ⚡ **Sub-5 Second Settlement** | Transactions finalised in seconds, not days |
| 🔍 **Anchor Fee Comparison** | Compare SEP-24 anchor fees side-by-side |
| 📊 **DEX Rate Monitor** | Live Stellar DEX rates with configurable alerts |
| 📱 **Mobile-First UI** | Responsive design with Framer Motion animations |
| 🔒 **Bank-Grade Security** | Encryption, regulated anchors, SEC compliant |
| 🧩 **Soroban Smart Contracts** | Extensible via Rust-based Soroban contracts |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org) (App Router) | React framework with SSR/SSG |
| [React 19](https://react.dev) | UI component library |
| [TypeScript](https://typescriptlang.org) | Type-safe development |
| [Tailwind CSS 4](https://tailwindcss.com) | Utility-first styling |
| [Framer Motion](https://framermotion.framer.website) | Page & component animations |
| [Material Symbols](https://fonts.google.com/icons) | Icon system |

### Backend & Blockchain

| Technology | Purpose |
|---|---|
| [Stellar Network](https://stellar.org) | Blockchain settlement layer |
| [Stellar Horizon](https://developers.stellar.org/api/horizon) | Blockchain API & path payments |
| [SEP-24](https://stellar.org/protocol/sep-24) | Anchor off-ramp standard |
| [Soroban](https://soroban.stellar.org) | Smart contract platform (Rust) |

### Tooling

| Tool | Purpose |
|---|---|
| ESLint | Code linting |
| PostCSS | CSS processing |
| TypeScript | Type checking |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9 (or pnpm / yarn)
- A Stellar testnet/public network endpoint (optional for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/Codex723/RemitX.git
cd RemitX

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
RemitX/
├── public/                  # Static assets (favicon, images)
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── (app)/           # Authenticated app layout group
│   │   │   ├── activity/    # Transaction history
│   │   │   ├── anchors/     # Anchor comparison & management
│   │   │   ├── dashboard/   # Main dashboard
│   │   │   ├── rates/       # DEX rate monitor
│   │   │   ├── review/      # Transaction review
│   │   │   ├── routes/      # Path payment routing
│   │   │   ├── send/        # Send money flow
│   │   │   └── layout.tsx   # Authenticated layout
│   │   ├── favicon.ico
│   │   ├── globals.css      # Global styles & Tailwind
│   │   ├── layout.tsx       # Root layout (metadata, fonts)
│   │   └── page.tsx         # Landing page
│   └── components/          # Shared UI components
│       ├── Header.tsx       # App header / navigation
│       └── Sidebar.tsx      # App sidebar navigation
├── .env.example             # Environment variable template
├── .gitignore
├── eslint.config.mjs        # ESLint configuration
├── next.config.ts           # Next.js configuration
├── package.json
├── postcss.config.mjs       # PostCSS configuration
├── tsconfig.json            # TypeScript configuration
└── README.md
```

---

## Architecture

RemitX follows a **Next.js App Router** architecture with a clear separation between public and authenticated routes.

```
┌─────────────────────────────────────────────────────┐
│                    Client (Next.js)                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Landing  │  │ Dashboard│  │ Send / Routes /   │  │
│  │  Page    │  │          │  │ Anchors / Rates   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                      │                               │
│              ┌───────┴───────┐                       │
│              │  Stellar SDK  │                       │
│              │  (Horizon)    │                       │
│              └───────┬───────┘                       │
└──────────────────────┼──────────────────────────────┘
                       │
              ┌────────┴────────┐
              │  Stellar Network │
              │  (Horizon API)   │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │  SEP-24 Anchors  │
              │  (Off-ramps)     │
              └─────────────────┘
```

### Key Design Decisions

- **App Router** — Uses Next.js 16 App Router for nested layouts, server components, and route groups.
- **Route Groups** — The `(app)` route group wraps all authenticated pages with a shared layout (Header + Sidebar).
- **Client Components** — Interactive pages (dashboard, send, rates) use `"use client"` for state and effects.
- **Stellar Integration** — Direct Horizon API calls from the client for path payments and rate queries.
- **Mobile-First** — Responsive design with Tailwind breakpoints, optimised for mobile wallets.

---

## Routes

| Route | Description | Auth Required |
|---|---|---|
| `/` | Landing page | No |
| `/dashboard` | Main dashboard with portfolio overview | Yes |
| `/send` | Send money flow (amount, currency, recipient) | Yes |
| `/routes` | Path payment routing & comparison | Yes |
| `/anchors` | Anchor fee comparison & management | Yes |
| `/rates` | DEX rate monitor with alerts | Yes |
| `/review` | Transaction review & confirmation | Yes |
| `/activity` | Transaction history & status | Yes |

---

## Environment Variables

Create a `.env.local` file in the project root by copying the template:

```bash
cp .env.example .env.local
```

### Available Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | Yes | `testnet` | Set to `mainnet` to connect to Stellar mainnet (uses real funds!). Leave unset or set to `testnet` for safe testing. |
| `HORIZON_URL` | No | _(auto)_ | Custom Horizon endpoint. Defaults to the public testnet or mainnet endpoint based on `STELLAR_NETWORK`. |
| `STELLAR_PUBLIC_KEY` | No | _(auto)_ | Freighter wallet public key. Auto-detected from the Freighter browser extension. |
| `PORT` | No | `3000` | Server port for the Next.js development server. |

### Example `.env.local`

```env
# Stellar Network Configuration
# Set to "mainnet" to connect to Stellar mainnet (uses real funds!)
# Leave unset or set to "testnet" for safe testing
STELLAR_NETWORK=testnet

# Optional: Custom Horizon endpoint (defaults to public testnet/mainnet)
# HORIZON_URL=https://horizon-testnet.stellar.org

# Optional: Freighter wallet public key (auto-detected from extension)
# STELLAR_PUBLIC_KEY=

# Server port (default: 3000)
PORT=3000
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing component structure
- Run `npm run lint` before committing
- Test on both desktop and mobile viewports

---

## License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  Built on the <a href="https://stellar.org">Stellar Network</a> 🌟
</p>