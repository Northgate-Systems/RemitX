//! RemitX Escrow Contract
//!
//! Holds a remittance transfer in escrow until a release condition is met,
//! or refunds it to the sender after expiry. Implements:
//! - Full deposit/release/refund lifecycle with status transitions
//! - Platform-authorized release (require_auth on the platform address)
//! - Deterministic escrow IDs derived from deposit parameters
//! - Event emissions for off-chain indexing

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, token, xdr::ToXdr,
    Address, Bytes, BytesN, Env,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    InvalidAmount = 1,
    InvalidExpiry = 2,
    NotLocked = 3,
    Expired = 4,
    Unauthorized = 5,
    NotFound = 6,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum StorageKey {
    Escrow(BytesN<32>),
    EscrowCount,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct EscrowState {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub expires_at: u64,
    pub released_at: Option<u64>,
    pub refunded_at: Option<u64>,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Lock funds in escrow until `expires_at`.
    ///
    /// Tokens are transferred from `sender` into this contract. The escrow
    /// may later be released to `recipient` (by the platform, before expiry)
    /// or refunded to `sender` (after expiry).
    pub fn deposit(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
        asset: Address,
        expires_at: u64,
    ) -> BytesN<32> {
        if amount <= 0 {
            panic_with_error!(env, EscrowError::InvalidAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            panic_with_error!(env, EscrowError::InvalidExpiry);
        }

        let count = Self::get_escrow_count(env.clone());
        let escrow_id = Self::compute_id(&env, &sender, &recipient, amount, expires_at, count);

        // Transfer tokens from sender into this contract. The token contract
        // enforces `sender` authorization.
        token::Client::new(&env, &asset).transfer(
            &sender,
            &env.current_contract_address(),
            &amount,
        );

        let state = EscrowState {
            sender: sender.clone(),
            recipient: recipient.clone(),
            amount,
            asset: asset.clone(),
            status: EscrowStatus::Locked,
            created_at: env.ledger().timestamp(),
            expires_at,
            released_at: None,
            refunded_at: None,
        };
        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);
        env.storage()
            .instance()
            .set(&StorageKey::EscrowCount, &(count + 1));

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("deposit"), escrow_id.clone()),
            (sender, recipient, amount, asset),
        );

        escrow_id
    }

    /// Release the escrowed funds to the recipient.
    ///
    /// Only callable by the platform (`platform.require_auth()`), and only
    /// while the escrow is locked and has not expired.
    pub fn release(env: Env, escrow_id: BytesN<32>) {
        let platform = Self::platform(&env);
        platform.require_auth();

        let mut state = Self::load_escrow(&env, &escrow_id);
        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }
        if env.ledger().timestamp() > state.expires_at {
            panic_with_error!(env, EscrowError::Expired);
        }

        token::Client::new(&env, &state.asset).transfer(
            &env.current_contract_address(),
            &state.recipient,
            &state.amount,
        );

        state.status = EscrowStatus::Released;
        state.released_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("release"), escrow_id),
            (state.recipient, state.amount),
        );
    }

    /// Refund the escrowed funds to the sender.
    ///
    /// Only callable by `sender`, and only after the escrow has expired.
    pub fn refund(env: Env, escrow_id: BytesN<32>) {
        let mut state = Self::load_escrow(&env, &escrow_id);
        state.sender.require_auth();

        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }
        if env.ledger().timestamp() <= state.expires_at {
            panic_with_error!(env, EscrowError::Expired);
        }

        token::Client::new(&env, &state.asset).transfer(
            &env.current_contract_address(),
            &state.sender,
            &state.amount,
        );

        state.status = EscrowStatus::Refunded;
        state.refunded_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refund"), escrow_id),
            (state.sender, state.amount),
        );
    }

    /// Get escrow state (read-only).
    pub fn get_escrow(env: Env, escrow_id: BytesN<32>) -> EscrowState {
        Self::load_escrow(&env, &escrow_id)
    }

    /// Get the total number of escrows created (read-only).
    pub fn get_escrow_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::EscrowCount)
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// The platform release authority, stored at deployment via the
    /// contract constructor.
    fn platform(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("platform"))
            .expect("escrow: not initialized")
    }

    fn load_escrow(env: &Env, escrow_id: &BytesN<32>) -> EscrowState {
        env.storage()
            .persistent()
            .get(&StorageKey::Escrow(escrow_id.clone()))
            .expect("Escrow not found")
    }

    /// Deterministically derive an escrow ID from the deposit parameters plus
    /// a nonce (the current escrow count) to guarantee uniqueness.
    fn compute_id(
        env: &Env,
        sender: &Address,
        recipient: &Address,
        amount: i128,
        expires_at: u64,
        nonce: u32,
    ) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.append(&sender.to_xdr(env));
        buf.append(&recipient.to_xdr(env));
        buf.append(&Bytes::from_array(env, &amount.to_be_bytes()));
        buf.append(&Bytes::from_array(env, &expires_at.to_be_bytes()));
        buf.append(&Bytes::from_array(env, &nonce.to_be_bytes()));
        env.crypto().sha256(&buf).to_bytes()
    }

    /// Contract constructor: records the platform release authority.
    pub fn __constructor(env: Env, platform: Address) {
        env.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("platform"), &platform);
    }
}

#[cfg(test)]
mod test;