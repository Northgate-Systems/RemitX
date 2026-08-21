# Contributing to RemitX

Welcome! This guide walks you through how to claim an issue, what to expect, and how payments/grants work for RemitX contributors.

---

## Table of Contents

- [Claiming an Issue](#claiming-an-issue)
- [Expected Turnaround](#expected-turnaround)
- [How Payment & Grants Work](#how-payment--grants-work)
- [Development Setup](#development-setup)
- [Opening a Pull Request](#opening-a-pull-request)
- [Code Style](#code-style)
- [Need Help?](#need-help)

---

## Claiming an Issue

1. **Browse open issues** at [github.com/Northgate-Systems/RemitX/issues](https://github.com/Northgate-Systems/RemitX/issues).
2. **Check the labels** — look for `good-first-issue`, `bounty:free`, or `help-wanted` to find contributor-friendly tasks.
3. **Comment on the issue** to express interest before starting work:
   ```
   I'd like to work on this. Estimated completion: <date>
   ```
4. **Wait for acknowledgment** from a maintainer before investing significant time on large issues.
5. **One issue at a time** — please don't claim multiple issues simultaneously until you have a merged PR.

> **Tip:** Issues tagged `good-first-issue` are specifically scoped for new contributors. They come with clear acceptance criteria and focused scope.

---

## Expected Turnaround

| Issue Type        | Expected Turnaround |
|-------------------|---------------------|
| Documentation     | 2–5 days            |
| Bug Fix (minor)   | 3–7 days            |
| Feature (scoped)  | 5–14 days           |
| Feature (large)   | 14–30 days          |

- **Communicate early** if you need more time. Drop a comment on the issue — maintainers appreciate transparency over silence.
- Issues with no activity for **14 days** after claiming may be reopened for other contributors.

---

## How Payment & Grants Work

RemitX uses a **GrantFox-style** contribution model:

### Free Contributions (`bounty:free`)
- No monetary reward, but your work is credited in the repo and `CONTRIBUTORS.md`.
- Great for portfolio, learning, and OSS reputation.
- Accepted via standard pull request review.

### Paid Bounties (when labeled with a dollar amount)
1. **Bounty amount** is listed in the issue title and description (e.g., `[$50] Fix X`).
2. **Claim your work** by commenting `/claim` on the issue when your PR is ready for review.
3. **Payment is released** after the PR is merged and verified by a maintainer.
4. **Payment method** will be coordinated via the contact in the issue or via the GrantFox platform linked in the issue.
5. If no payment platform is linked, contact the maintainer directly via the issue or email listed in the README.

> **Important:** Never send payment details (wallet addresses, bank info) in public comments. Maintainers will reach out privately.

---

## Development Setup

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/RemitX.git
cd RemitX

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env.local
# Fill in your Supabase and other credentials

# 4. Run the development server
npm run dev
# App is available at http://localhost:3000
```

### Prerequisites
- **Node.js** 18+
- **npm** 9+
- A **Supabase** project (free tier works fine for local dev)
- Optional: A Stellar testnet account for payment flow testing

---

## Opening a Pull Request

1. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b docs/contributor-onboarding-checklist
   git checkout -b fix/auth-redirect-loop
   git checkout -b feat/rate-display-component
   ```
2. **Make your changes** and commit with a clear message:
   ```bash
   git commit -m "docs: add contributor onboarding checklist"
   git commit -m "fix: correct auth redirect on logout"
   ```
3. **Push and open a PR** targeting the `main` branch of `Northgate-Systems/RemitX`.
4. **Fill in the PR description** — link the issue with `Closes #<issue-number>`.
5. **Respond to review comments** promptly. Two rounds of feedback is the norm.

---

## Code Style

- **TypeScript** — all new code must be typed. Avoid `any`.
- **Prettier** — run `npm run format` before committing.
- **ESLint** — run `npm run lint` and fix all errors before opening a PR.
- **Component structure** — follow existing patterns in `src/app` and `src/components`.
- **Comments** — explain *why*, not *what*. Code should be self-documenting where possible.

---

## Need Help?

- **Open a discussion** on the [GitHub Discussions](https://github.com/Northgate-Systems/RemitX/discussions) tab.
- **Comment on the issue** you're working on — maintainers monitor all open issues.
- **Check `FOUNDATION.md`** for a full breakdown of what's been built and what's stubbed out for contributors.

We appreciate every contribution, big or small. Thank you for helping build RemitX! 🚀
