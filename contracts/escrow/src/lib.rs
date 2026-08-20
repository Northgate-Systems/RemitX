//! RemitX Escrow Contract
//!
//! Holds a remittance transfer in escrow until a release condition is met.
//! If the release condition is not met before `expires_at`, the sender can
//! call `refund()` to get their funds back.
//!
//! # Open Design Question: What authorizes `release()`?
//!
//! This is deliberately not implemented here - it's intended as a design
//! issue for an external contributor (via GrantFox). Candidate approaches:
//!
//! 1. **Backend-signed auth**: The RemitX backend signs a release
//!    authorization with a known key. The contract verifies the signature.
//!    Simple but gives the backend unilateral control.
//!
//! 2. **Multi-sig (sender + recipient)**: Both parties must sign to release.
//!    More decentralized but requires both to be online / cooperative.
//!
//! 3. **Oracle / timelock hybrid**: Release is authorized after a time
//!    lock OR by an oracle signature. Flexible but more complex.
//!
//! See `contracts/escrow/README.md` for the full discussion.

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contractmeta, token, xdr::ToXdr, Address, BytesN, Env, Symbol,
};

contractmeta!(key = "RemitX Escrow", val = "0.1.0");

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
    Expired,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct EscrowState {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub expires_at: u64,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum EscrowDataKey {
    Escrow(BytesN<32>),
    EscrowCount,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Lock funds in escrow.
    ///
    /// Transfers `amount` of `asset` from `sender` to this contract and
    /// stores an EscrowState. Returns the escrow ID (a hash of the
    /// parameters).
    ///
    /// Validates that `amount > 0` and `expires_at` is in the future.
    pub fn deposit(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
        asset: Address,
        expires_at: u64,
    ) -> BytesN<32> {
        sender.require_auth();

        // Validate amount is positive
        if amount <= 0 {
            panic!("amount must be greater than zero");
        }

        // Validate expires_at is in the future
        if expires_at <= env.ledger().timestamp() {
            panic!("expires_at must be in the future");
        }

        // Transfer tokens from sender to this contract
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        // Generate a deterministic escrow_id from the parameters
        let mut hash_input = soroban_sdk::Bytes::new(&env);
        hash_input.append(&sender.clone().to_xdr(&env));
        hash_input.append(&recipient.clone().to_xdr(&env));
        hash_input.append(&soroban_sdk::Bytes::from_array(&env, &amount.to_be_bytes()));
        hash_input.append(&soroban_sdk::Bytes::from_array(&env, &expires_at.to_be_bytes()));
        let escrow_id: BytesN<32> = env.crypto().sha256(&hash_input).into();

        let state = EscrowState {
            sender,
            recipient,
            amount,
            asset,
            status: EscrowStatus::Locked,
            expires_at,
        };
        env.storage().instance().set(&EscrowDataKey::Escrow(escrow_id.clone()), &state);

        // Increment and persist the escrow count
        let count: u32 = env
            .storage()
            .instance()
            .get(&EscrowDataKey::EscrowCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&EscrowDataKey::EscrowCount, &(count + 1));

        // Emit a deposited event for off-chain indexing
        env.events().publish(
            (Symbol::new(&env, "deposited"), escrow_id.clone()),
            (state.recipient, state.amount),
        );

        escrow_id
    }

    /// Release escrowed funds to the recipient.
    ///
    /// The authorization mechanism for release() is intentionally left
    /// as an open design question. See the module-level doc comment and
    /// contracts/escrow/README.md for context.
    ///
    /// Asserts the escrow is `Locked` and not expired before releasing.
    pub fn release(env: Env, escrow_id: BytesN<32>) {
        let state: EscrowState = env
            .storage()
            .instance()
            .get(&EscrowDataKey::Escrow(escrow_id.clone()))
            .expect("Escrow not found");

        // Assert the escrow is Locked
        if state.status != EscrowStatus::Locked {
            panic!("escrow is not in Locked status");
        }

        // Assert the escrow has not expired
        if env.ledger().timestamp() > state.expires_at {
            panic!("escrow has expired, use refund() instead");
        }

        // Transfer funds to the recipient
        let token_client = token::Client::new(&env, &state.asset);
        token_client.transfer(&env.current_contract_address(), &state.recipient, &state.amount);

        let updated = EscrowState {
            status: EscrowStatus::Released,
            ..state
        };
        env.storage()
            .instance()
            .set(&EscrowDataKey::Escrow(escrow_id.clone()), &updated);

        // Emit a released event for off-chain indexing
        env.events().publish(
            (Symbol::new(&env, "released"), escrow_id),
            (updated.recipient, updated.amount),
        );
    }

    /// Refund escrowed funds to the sender if the escrow has expired.
    ///
    /// Asserts the escrow is `Locked` and has expired before refunding.
    pub fn refund(env: Env, escrow_id: BytesN<32>) {
        let state: EscrowState = env
            .storage()
            .instance()
            .get(&EscrowDataKey::Escrow(escrow_id.clone()))
            .expect("Escrow not found");

        // Assert the escrow is Locked
        if state.status != EscrowStatus::Locked {
            panic!("escrow is not in Locked status");
        }

        // Assert the escrow has expired
        if env.ledger().timestamp() <= state.expires_at {
            panic!("escrow has not expired yet");
        }

        // Transfer funds back to the sender
        let token_client = token::Client::new(&env, &state.asset);
        token_client.transfer(&env.current_contract_address(), &state.sender, &state.amount);

        let updated = EscrowState {
            status: EscrowStatus::Refunded,
            ..state
        };
        env.storage()
            .instance()
            .set(&EscrowDataKey::Escrow(escrow_id.clone()), &updated);

        // Emit a refunded event for off-chain indexing
        env.events().publish(
            (Symbol::new(&env, "refunded"), escrow_id),
            (updated.sender, updated.amount),
        );
    }

    /// Read-only getter for escrow state.
    ///
    /// This is fully implemented since it's a simple storage read.
    pub fn get_escrow(env: Env, escrow_id: BytesN<32>) -> EscrowState {
        env.storage()
            .instance()
            .get(&EscrowDataKey::Escrow(escrow_id))
            .expect("Escrow not found")
    }

    /// Read-only getter for the total number of escrows created.
    pub fn get_escrow_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&EscrowDataKey::EscrowCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;