# RemitX Escrow Contract

A Soroban smart contract that holds a remittance transfer in escrow until a release condition is met. If the release condition is not met before the expiry time, the sender can refund their funds.

## Purpose

When a user sends money via RemitX, the funds can optionally be locked in this escrow contract instead of being sent directly to the recipient. This gives the sender a safety net — if something goes wrong (wrong address, delivery failure), the funds can be recovered after expiry.

## Contract Interface

| Function | Status | Description |
|----------|--------|-------------|
| `deposit(sender, recipient, amount, asset, expires_at) -> BytesN<32>` | Stub | Locks funds in escrow, returns escrow ID |
| `release(escrow_id)` | Stub | Releases funds to recipient |
| `refund(escrow_id)` | Stub | Refunds funds to sender after expiry |
| `get_escrow(escrow_id) -> EscrowState` | **Implemented** | Read-only state getter |

## What's Implemented vs. Stubbed

- **`get_escrow()`** — Fully implemented. Reads from contract storage.
- **`deposit()`** — Structure in place, but the actual token transfer logic and escrow ID generation are stubbed.
- **`release()`** — Structure in place. The authorization mechanism is deliberately left as an open design question.
- **`refund()`** — Structure in place. The time-check and token transfer logic are stubbed.

## Open Design Question: What should authorize `release()`?

This is the most important unresolved issue and should be turned into a standalone GitHub issue on GrantFox.

### Candidate Approaches

#### 1. Backend-signed authorization (simplest)
The RemitX backend holds a signing key. When the sender confirms the transaction on the RemitX app, the backend signs a release message and submits it to the contract. The contract verifies the backend's public key.

**Pros:** Simple, works with the existing app flow, no extra on-chain complexity.  
**Cons:** Centralized — the backend has unilateral control over fund release.

#### 2. Multi-sig (sender + recipient both sign)
Both the sender and recipient must authorize the release. The sender and recipient each sign, and the contract verifies both signatures.

**Pros:** Truly decentralized — neither party can unilaterally control funds.  
**Cons:** Requires both parties to be online and cooperative. If the recipient disappears, funds are stuck until expiry. Poor UX for a remittance app.

#### 3. Oracle / timelock hybrid
A time lock releases funds automatically after the delivery window expires, OR an oracle (e.g., confirming fiat settlement via an anchor) can release early.

**Pros:** Best UX — funds always land somewhere.  
**Cons:** Most complex. Requires an oracle integration and careful edge-case handling.

### What to consider when deciding

- **RemitX is a remittance app** — UX matters more than pure decentralization.
- **The Stellar network supports path payments** — the escrow is an optional layer, not the primary transfer mechanism.
- **GrantFox contributors** — the chosen approach should be well-scoped as a single issue, not a multi-month research project.

**We are NOT picking one here.** This README exists to frame the decision for a future contributor issue.

## Build & Test

```bash
cd contracts/escrow
cargo build
cargo test
```

## Prerequisites

- Rust with `wasm32-unknown-unknown` target
- Soroban CLI (optional, for deployment)