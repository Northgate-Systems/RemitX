//! RemitX Escrow Contract
//!
//! Holds a remittance transfer in escrow until a release condition is met,
//! or refunds it to the sender after expiry. Implements:
//! - Full deposit/release/refund lifecycle with status transitions
//! - Platform-authorized release (require_auth on the platform address)
//! - Deterministic escrow IDs derived from deposit parameters
//! - Event emissions for off-chain indexing
//! - Partial release and batch operations
//! - Fee collection on every release
//! - Escrow cancellation before expiry by sender
//! - Escrow expiry extension by platform
//! - Comprehensive getter set for off-chain indexers

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, token, xdr::ToXdr,
    Address, Bytes, BytesN, Env, Vec,
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
    AlreadyReleased = 7,
    AlreadyRefunded = 8,
    CannotExtendExpired = 9,
    CannotCancelLocked = 10,
    InvalidFee = 11,
    InsufficientBalance = 12,
    ZeroRecipient = 13,
    ZeroSender = 14,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum StorageKey {
    Escrow(BytesN<32>),
    EscrowCount,
    Platform,
    FeeBps,
    FeeTreasury,
    Paused,
    EscrowBySender(Address),
    EscrowByRecipient(Address),
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
    Cancelled,
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
    pub cancelled_at: Option<u64>,
    pub fee_collected: i128,
    pub release_count: u32,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct ReleaseResult {
    pub escrow_id: BytesN<32>,
    pub recipient: Address,
    pub amount_out: i128,
    pub fee: i128,
    pub timestamp: u64,
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
        if sender == Address::from_string(&env, "").unwrap() {
            panic_with_error!(env, EscrowError::ZeroSender);
        }
        if recipient == Address::from_string(&env, "").unwrap() {
            panic_with_error!(env, EscrowError::ZeroRecipient);
        }
        if amount <= 0 {
            panic_with_error!(env, EscrowError::InvalidAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            panic_with_error!(env, EscrowError::InvalidExpiry);
        }

        let count = Self::get_escrow_count(env.clone());
        let escrow_id = Self::compute_id(&env, &sender, &recipient, amount, expires_at, count);

        let balance = token::Client::new(&env, &asset).balance(&sender);
        if balance < amount {
            panic_with_error!(env, EscrowError::InsufficientBalance);
        }

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
            cancelled_at: None,
            fee_collected: 0,
            release_count: 0,
        };

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        let mut sender_escs: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&StorageKey::EscrowBySender(sender.clone()))
            .unwrap_or(Vec::new(&env));
        sender_escs.push_back(escrow_id.clone());
        env.storage()
            .persistent()
            .set(&StorageKey::EscrowBySender(sender), &sender_escs);

        let mut recipient_escs: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&StorageKey::EscrowByRecipient(recipient.clone()))
            .unwrap_or(Vec::new(&env));
        recipient_escs.push_back(escrow_id.clone());
        env.storage()
            .persistent()
            .set(&StorageKey::EscrowByRecipient(recipient), &recipient_escs);

        env.storage()
            .instance()
            .set(&StorageKey::EscrowCount, &(count + 1));

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("deposit"), escrow_id.clone()),
            (sender, recipient, amount, asset, expires_at),
        );

        escrow_id
    }

    /// Release escrowed funds to the recipient.
    ///
    /// Only callable by the platform authority. A configurable fee (basis
    /// points) is deducted and sent to the fee treasury. Supports partial
    /// release via `amount` — if `amount` is less than the escrowed amount,
    /// the escrow remains `Locked` with the balance intact.
    pub fn release(
        env: Env,
        escrow_id: BytesN<32>,
        amount: Option<i128>,
    ) -> ReleaseResult {
        let platform = Self::platform(&env);
        platform.require_auth();

        let mut state = Self::load_escrow(&env, &escrow_id);
        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }

        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::FeeBps)
            .unwrap_or(0);

        let release_amount = amount.unwrap_or(state.amount);
        if release_amount <= 0 || release_amount > state.amount {
            panic_with_error!(env, EscrowError::InvalidAmount);
        }

        let fee = release_amount * fee_bps as i128 / 10_000;
        let amount_out = release_amount - fee;

        if fee > 0 {
            let treasury: Address = env
                .storage()
                .instance()
                .get(&StorageKey::FeeTreasury)
                .expect("fee treasury not set");
            token::Client::new(&env, &state.asset).transfer(
                &env.current_contract_address(),
                &treasury,
                &fee,
            );
        }

        token::Client::new(&env, &state.asset).transfer(
            &env.current_contract_address(),
            &state.recipient,
            &amount_out,
        );

        state.fee_collected += fee;
        state.release_count += 1;

        if release_amount >= state.amount {
            state.status = EscrowStatus::Released;
            state.released_at = Some(env.ledger().timestamp());
        }

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        let result = ReleaseResult {
            escrow_id: escrow_id.clone(),
            recipient: state.recipient.clone(),
            amount_out,
            fee,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("release"), escrow_id),
            (state.recipient, amount_out, fee),
        );

        result
    }

    /// Refund the escrowed funds to the sender.
    ///
    /// Only callable by `sender`, and only after the escrow has expired.
    /// A partial refund is supported via `amount`.
    pub fn refund(env: Env, escrow_id: BytesN<32>, amount: Option<i128>) {
        let mut state = Self::load_escrow(&env, &escrow_id);
        state.sender.require_auth();

        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }
        if env.ledger().timestamp() <= state.expires_at {
            panic_with_error!(env, EscrowError::Expired);
        }

        let refund_amount = amount.unwrap_or(state.amount);
        if refund_amount <= 0 || refund_amount > state.amount {
            panic_with_error!(env, EscrowError::InvalidAmount);
        }

        token::Client::new(&env, &state.asset).transfer(
            &env.current_contract_address(),
            &state.sender,
            &refund_amount,
        );

        if refund_amount >= state.amount {
            state.status = EscrowStatus::Refunded;
            state.refunded_at = Some(env.ledger().timestamp());
        }

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refund"), escrow_id),
            (state.sender, refund_amount),
        );
    }

    /// Cancel a locked escrow before expiry, returning funds to the sender.
    ///
    /// Only callable by the sender. Cannot be called after expiry — use
    /// `refund` instead.
    pub fn cancel(env: Env, escrow_id: BytesN<32>) {
        let mut state = Self::load_escrow(&env, &escrow_id);
        state.sender.require_auth();

        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }
        if env.ledger().timestamp() > state.expires_at {
            panic_with_error!(env, EscrowError::CannotCancelLocked);
        }

        token::Client::new(&env, &state.asset).transfer(
            &env.current_contract_address(),
            &state.sender,
            &state.amount,
        );

        state.status = EscrowStatus::Cancelled;
        state.cancelled_at = Some(env.ledger().timestamp());

        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("cancel"), escrow_id),
            (state.sender, state.amount),
        );
    }

    /// Extend the expiry of a locked escrow.
    ///
    /// Only callable by the platform authority. Cannot extend an already
    /// expired escrow.
    pub fn extend_expiry(env: Env, escrow_id: BytesN<32>, new_expires_at: u64) {
        let platform = Self::platform(&env);
        platform.require_auth();

        let mut state = Self::load_escrow(&env, &escrow_id);
        if state.status != EscrowStatus::Locked {
            panic_with_error!(env, EscrowError::NotLocked);
        }
        if env.ledger().timestamp() > state.expires_at {
            panic_with_error!(env, EscrowError::CannotExtendExpired);
        }
        if new_expires_at <= state.expires_at {
            panic_with_error!(env, EscrowError::InvalidExpiry);
        }

        state.expires_at = new_expires_at;
        env.storage()
            .persistent()
            .set(&StorageKey::Escrow(escrow_id.clone()), &state);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("extend"), escrow_id),
            (state.sender, new_expires_at),
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

    /// Get all escrow IDs associated with a sender (read-only).
    pub fn get_escrows_by_sender(env: Env, sender: Address) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&StorageKey::EscrowBySender(sender))
            .unwrap_or(Vec::new(&env))
    }

    /// Get all escrow IDs associated with a recipient (read-only).
    pub fn get_escrows_by_recipient(env: Env, recipient: Address) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&StorageKey::EscrowByRecipient(recipient))
            .unwrap_or(Vec::new(&env))
    }

    /// Get the configured release fee in basis points (read-only).
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::FeeBps)
            .unwrap_or(0)
    }

    /// Get the fee treasury address (read-only).
    pub fn get_fee_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::FeeTreasury)
            .expect("fee treasury not set")
    }

    /// Check whether the escrow contract is paused (read-only).
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Admin functions
    // -----------------------------------------------------------------------

    /// Set the release fee in basis points. Platform-only.
    pub fn set_fee_bps(env: Env, fee_bps: u32) {
        let platform = Self::platform(&env);
        platform.require_auth();
        if fee_bps > 500 {
            panic_with_error!(env, EscrowError::InvalidFee);
        }
        env.storage()
            .instance()
            .set(&StorageKey::FeeBps, &fee_bps);
    }

    /// Set the fee treasury address. Platform-only.
    pub fn set_fee_treasury(env: Env, treasury: Address) {
        let platform = Self::platform(&env);
        platform.require_auth();
        env.storage()
            .instance()
            .set(&StorageKey::FeeTreasury, &treasury);
    }

    /// Pause or unpause the contract. Platform-only.
    pub fn set_paused(env: Env, paused: bool) {
        let platform = Self::platform(&env);
        platform.require_auth();
        env.storage().instance().set(&StorageKey::Paused, &paused);
    }

    /// The platform release authority, stored at deployment via the
    /// contract constructor.
    fn platform(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Platform)
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

    /// Contract constructor: records the platform release authority, fee
    /// treasury, and default fee (0 bps).
    pub fn __constructor(
        env: Env,
        platform: Address,
        fee_treasury: Address,
        fee_bps: u32,
    ) {
        if fee_bps > 500 {
            panic_with_error!(env, EscrowError::InvalidFee);
        }
        env.storage()
            .instance()
            .set(&StorageKey::Platform, &platform);
        env.storage()
            .instance()
            .set(&StorageKey::FeeTreasury, &fee_treasury);
        env.storage()
            .instance()
            .set(&StorageKey::FeeBps, &fee_bps);
        env.storage()
            .instance()
            .set(&StorageKey::EscrowCount, &0u32);
        env.storage()
            .instance()
            .set(&StorageKey::Paused, &false);
    }
}

#[cfg(test)]
mod test;