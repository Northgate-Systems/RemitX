//! Unit tests for the RemitX Escrow Contract.
//!
//! Deploys a minimal mock token contract to satisfy the token transfers
//! performed by deposit()/release()/refund(), then tests all contract
//! behaviors end to end.

#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

// ---------------------------------------------------------------------------
// Minimal mock token contract (test-only), implementing the transfer/balance
// surface needed by the escrow contract.
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum MockTokenDataKey {
    Balance(Address),
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    /// Mint `amount` of the token to `to`.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let cur: i128 = env
            .storage()
            .instance()
            .get(&MockTokenDataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MockTokenDataKey::Balance(to), &(cur + amount));
    }

    /// Return the balance of `id`.
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&MockTokenDataKey::Balance(id))
            .unwrap_or(0)
    }

    /// Transfer `amount` from `from` to `to`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        let from_bal: i128 = env
            .storage()
            .instance()
            .get(&MockTokenDataKey::Balance(from.clone()))
            .unwrap_or(0);
        if from_bal < amount {
            panic!("insufficient balance");
        }
        let to_bal: i128 = env
            .storage()
            .instance()
            .get(&MockTokenDataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MockTokenDataKey::Balance(from), &(from_bal - amount));
        env.storage()
            .instance()
            .set(&MockTokenDataKey::Balance(to), &(to_bal + amount));
    }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

struct TestHarness<'a> {
    escrow: EscrowContractClient<'a>,
    token: MockTokenClient<'a>,
    sender: Address,
    recipient: Address,
    contract_id: Address,
}

/// Deploy mock token + escrow, mint funds, and return the harness.
fn setup(env: &Env) -> TestHarness<'_> {
    env.mock_all_auths();

    // Deploy mock token.
    let token = MockTokenClient::new(env, &env.register(MockToken, ()));

    // Fund two addresses.
    let sender = Address::generate(env);
    let recipient = Address::generate(env);
    token.mint(&sender, &10_000_000i128);
    token.mint(&recipient, &5_000_000i128);

    // Deploy escrow with the platform release authority.
    let platform = Address::generate(env);
    let contract_id = env.register(EscrowContract, (platform,));
    let escrow = EscrowContractClient::new(env, &contract_id);

    TestHarness {
        escrow,
        token,
        sender,
        recipient,
        contract_id,
    }
}

/// Create a funded escrow expiring in `expires_in` seconds.
fn create_escrow(h: &TestHarness, expires_in: u64) -> BytesN<32> {
    let amount: i128 = 1_000_000;
    let expires_at = h.escrow.env.ledger().timestamp() + expires_in;
    h.escrow.deposit(&h.sender, &h.recipient, &amount, &h.token.address, &expires_at)
}

// ---------------------------------------------------------------------------
// deposit() tests
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_locks_funds() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);

    // Funds moved from sender into the escrow contract.
    assert_eq!(h.token.balance(&h.sender), 9_000_000i128);
    assert_eq!(h.token.balance(&h.contract_id), 1_000_000i128);

    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.status, EscrowStatus::Locked);
    assert_eq!(state.amount, 1_000_000i128);
    assert_eq!(state.sender, h.sender);
    assert_eq!(state.recipient, h.recipient);
    assert_eq!(h.escrow.get_escrow_count(), 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_deposit_zero_amount_panics() {
    let env = Env::default();
    let h = setup(&env);
    let expires_at = env.ledger().timestamp() + 3600;
    h.escrow.deposit(&h.sender, &h.recipient, &0i128, &h.token.address, &expires_at);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_deposit_past_expiry_panics() {
    let env = Env::default();
    let h = setup(&env);
    let expires_at = env.ledger().timestamp(); // now == expiry, not strictly after
    h.escrow.deposit(&h.sender, &h.recipient, &1_000_000i128, &h.token.address, &expires_at);
}

// ---------------------------------------------------------------------------
// release() tests
// ---------------------------------------------------------------------------

#[test]
fn test_release_before_expiry() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);

    h.escrow.release(&id);
    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.status, EscrowStatus::Released);

    // Funds moved to recipient.
    assert_eq!(h.token.balance(&h.recipient), 6_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_release_after_expiry_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);
    h.escrow.release(&id);
}

// ---------------------------------------------------------------------------
// refund() tests
// ---------------------------------------------------------------------------

#[test]
fn test_refund_after_expiry() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);

    h.escrow.refund(&id);
    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.status, EscrowStatus::Refunded);

    // Funds returned to sender.
    assert_eq!(h.token.balance(&h.sender), 10_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_refund_before_expiry_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);
    h.escrow.refund(&id);
}

// ---------------------------------------------------------------------------
// Guard tests (double actions + non-existent escrows)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_double_release_prevented() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);
    h.escrow.release(&id);
    h.escrow.release(&id);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_double_refund_prevented() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_escrow(&h, 3600);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);
    h.escrow.refund(&id);
    h.escrow.refund(&id);
}

#[test]
#[should_panic(expected = "Escrow not found")]
fn test_release_nonexistent_escrow() {
    let env = Env::default();
    let h = setup(&env);
    let fake_id = BytesN::from_array(&env, &[0u8; 32]);
    h.escrow.release(&fake_id);
}

#[test]
#[should_panic(expected = "Escrow not found")]
fn test_refund_nonexistent_escrow() {
    let env = Env::default();
    let h = setup(&env);
    let fake_id = BytesN::from_array(&env, &[0u8; 32]);
    h.escrow.refund(&fake_id);
}