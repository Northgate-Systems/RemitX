//! Unit tests for the RemitX Escrow Contract.
//!
//! Deploys a simple mock token contract to satisfy the token transfers
//! performed by deposit()/release()/refund(), then tests all contract
//! behaviors end to end.

#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, Register};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

// ------------------------------------------------------------------------
// Minimal mock token contract (test-only) implementing the SEP-41 transfer
// surface needed by the escrow contract (transfer / balance / mint).
// ------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// Test helpers
// ----------------------------------------------------------------------------

struct TestHarness<'a> {
    _env: Env,
    escrow: EscrowContractClient<'a>,
    token: Address,
    sender: Address,
    recipient: Address,
}

/// Deploy mock token + escrow, mint funds, and create a funded escrow.
fn setup(env: &Env, expires_in: u64) -> (TestHarness<'_>, BytesN<32>) {
    env.mock_all_auths();

    // Deploy mock token.
    let token = MockToken.register(env, None, ());
    let token_client = MockTokenClient::new(env, &token);

    // Fund two addresses.
    let sender = Address::generate(env);
    let recipient = Address::generate(env);
    token_client.mint(&sender, &10_000_000i128);
    token_client.mint(&recipient, &5_000_000i128);

    // Deploy escrow and create the escrow.
    let escrow = EscrowContractClient::new(env, &EscrowContract.register(env, None, ()));
    let amount: i128 = 1_000_000;
    let expires_at = env.ledger().timestamp() + expires_in;
    let escrow_id = escrow.deposit(&sender, &recipient, &amount, &token, &expires_at);

    let h = TestHarness {
        _env: env.clone(),
        escrow,
        token,
        sender,
        recipient,
    };
    (h, escrow_id)
}

// ----------------------------------------------------------------------------
// deposit() tests
// ----------------------------------------------------------------------------

#[test]
fn test_deposit_happy_path() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);

    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.sender, h.sender);
    assert_eq!(state.recipient, h.recipient);
    assert_eq!(state.amount, 1_000_000i128);
    assert_eq!(state.asset, h.token);
    assert_eq!(state.status, EscrowStatus::Locked);
    assert!(state.expires_at > env.ledger().timestamp());
}

#[test]
fn test_deposit_increments_escrow_count() {
    let env = Env::default();
    let (h, _) = setup(&env, 3600);
    assert_eq!(h.escrow.get_escrow_count(), 1u32);

    // Create a second escrow.
    let expires_at = env.ledger().timestamp() + 7200;
    let id2 = h
        .escrow
        .deposit(&h.sender, &h.recipient, &500_000i128, &h.token, &expires_at);
    assert_eq!(h.escrow.get_escrow_count(), 2u32);
    assert_ne!(id2, BytesN::from_array(&env, &[0u8; 32]));

    // Third.
    let expires_at = env.ledger().timestamp() + 10_800;
    h.escrow
        .deposit(&h.recipient, &h.sender, &200_000i128, &h.token, &expires_at);
    assert_eq!(h.escrow.get_escrow_count(), 3u32);
}

#[test]
#[should_panic(expected = "amount must be greater than zero")]
fn test_deposit_rejects_zero_amount() {
    let env = Env::default();
    let (h, _) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() + 3600;
    h.escrow.deposit(&h.sender, &h.recipient, &0i128, &h.token, &expires_at);
}

#[test]
#[should_panic(expected = "amount must be greater than zero")]
fn test_deposit_rejects_negative_amount() {
    let env = Env::default();
    let (h, _) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() + 3600;
    h.escrow
        .deposit(&h.sender, &h.recipient, &(-100i128), &h.token, &expires_at);
}

#[test]
#[should_panic(expected = "expires_at must be in the future")]
fn test_deposit_rejects_past_expiry() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000_000);
    let (h, _) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() - 100; // already expired
    h.escrow
        .deposit(&h.sender, &h.recipient, &1_000_000i128, &h.token, &expires_at);
}

// ----------------------------------------------------------------------------
// release() tests
// ----------------------------------------------------------------------------

#[test]
fn test_release_before_expiry() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);

    // Recipient has 5,000,000 before release.
    h.escrow.release(&id);
    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.status, EscrowStatus::Released);

    // Funds moved to recipient.
    let token_client = MockTokenClient::new(&env, &h.token);
    let rec_bal = token_client.balance(&h.recipient);
    assert_eq!(rec_bal, 5_000_000i128 + 1_000_000i128);
}

#[test]
#[should_panic(expected = "escrow has expired")]
fn test_release_after_expiry_panics() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);
    // Advance the ledger past the expiry.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);
    h.escrow.release(&id);
}

// ----------------------------------------------------------------------------
// refund() tests
// ----------------------------------------------------------------------------

#[test]
fn test_refund_after_expiry() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);
    // Advance the ledger past the expiry.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);

    h.escrow.refund(&id);
    let state = h.escrow.get_escrow(&id);
    assert_eq!(state.status, EscrowStatus::Refunded);

    // Funds returned to sender.
    let token_client = MockTokenClient::new(&env, &h.token);
    let send_bal = token_client.balance(&h.sender);
    assert_eq!(send_bal, 10_000_000i128); // sent 1,000,000 out, got it back
}

#[test]
#[should_panic(expected = "escrow has not expired yet")]
fn test_refund_before_expiry_panics() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);
    h.escrow.refund(&id);
}

// ----------------------------------------------------------------------------
// Guard tests (double actions + non-existent escrows)
// ----------------------------------------------------------------------------

#[test]
#[should_panic(expected = "escrow is not in Locked status")]
fn test_double_release_prevented() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);
    h.escrow.release(&id);
    h.escrow.release(&id);
}

#[test]
#[should_panic(expected = "escrow is not in Locked status")]
fn test_double_refund_prevented() {
    let env = Env::default();
    let (h, id) = setup(&env, 3600);
    // Advance the ledger past the expiry.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);
    h.escrow.refund(&id);
    h.escrow.refund(&id);
}

#[test]
#[should_panic(expected = "Escrow not found")]
fn test_release_nonexistent_escrow() {
    let env = Env::default();
    let (h, _) = setup(&env, 3600);
    let fake_id = BytesN::from_array(&env, &[0u8; 32]);
    h.escrow.release(&fake_id);
}

#[test]
#[should_panic(expected = "Escrow not found")]
fn test_refund_nonexistent_escrow() {
    let env = Env::default();
    let (h, _) = setup(&env, 3600);
    let fake_id = BytesN::from_array(&env, &[0u8; 32]);
    h.escrow.refund(&fake_id);
}

// ----------------------------------------------------------------------------
// Concurrent escrows for the same sender/recipient pair (issue #342)
// ----------------------------------------------------------------------------

#[test]
fn test_identical_parameters_produce_distinct_escrow_ids() {
    let env = Env::default();
    let (h, id1) = setup(&env, 3600);

    // Same sender, recipient, amount, asset AND expiry as the first escrow.
    let expires_at = env.ledger().timestamp() + 3600;
    let id2 = h.escrow.deposit(
        &h.sender,
        &h.recipient,
        &1_000_000i128,
        &h.token,
        &expires_at,
    );

    assert_ne!(id1, id2, "identical parameters must not collide");
    assert_eq!(h.escrow.get_escrow_count(), 2u32);

    // Both escrows are stored independently and still Locked.
    let s1 = h.escrow.get_escrow(&id1);
    let s2 = h.escrow.get_escrow(&id2);
    assert_eq!(s1.status, EscrowStatus::Locked);
    assert_eq!(s2.status, EscrowStatus::Locked);
    assert_eq!(s1.amount, 1_000_000i128);
    assert_eq!(s2.amount, 1_000_000i128);

    // Both deposits actually left the sender and sit in the contract.
    let token_client = MockTokenClient::new(&env, &h.token);
    assert_eq!(
        token_client.balance(&h.sender),
        10_000_000i128 - 2_000_000i128
    );
}

#[test]
fn test_concurrent_escrows_release_independently() {
    let env = Env::default();
    let (h, id1) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() + 3600;
    let id2 = h.escrow.deposit(
        &h.sender,
        &h.recipient,
        &1_000_000i128,
        &h.token,
        &expires_at,
    );

    // Releasing the first escrow must not touch the second one.
    h.escrow.release(&id1);
    assert_eq!(h.escrow.get_escrow(&id1).status, EscrowStatus::Released);
    assert_eq!(h.escrow.get_escrow(&id2).status, EscrowStatus::Locked);

    let token_client = MockTokenClient::new(&env, &h.token);
    assert_eq!(
        token_client.balance(&h.recipient),
        5_000_000i128 + 1_000_000i128
    );

    // The second escrow is still releasable on its own.
    h.escrow.release(&id2);
    assert_eq!(h.escrow.get_escrow(&id2).status, EscrowStatus::Released);
    assert_eq!(
        token_client.balance(&h.recipient),
        5_000_000i128 + 2_000_000i128
    );
}

#[test]
fn test_concurrent_escrows_release_and_refund_independently() {
    let env = Env::default();
    let (h, id1) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() + 3600;
    let id2 = h.escrow.deposit(
        &h.sender,
        &h.recipient,
        &1_000_000i128,
        &h.token,
        &expires_at,
    );

    // Release one before expiry, refund the other after expiry.
    h.escrow.release(&id1);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);
    h.escrow.refund(&id2);

    assert_eq!(h.escrow.get_escrow(&id1).status, EscrowStatus::Released);
    assert_eq!(h.escrow.get_escrow(&id2).status, EscrowStatus::Refunded);

    let token_client = MockTokenClient::new(&env, &h.token);
    // Recipient got escrow #1, sender got escrow #2 back.
    assert_eq!(
        token_client.balance(&h.recipient),
        5_000_000i128 + 1_000_000i128
    );
    assert_eq!(
        token_client.balance(&h.sender),
        10_000_000i128 - 1_000_000i128
    );
}

#[test]
fn test_many_concurrent_identical_escrows_all_distinct() {
    let env = Env::default();
    let (h, first) = setup(&env, 3600);
    let expires_at = env.ledger().timestamp() + 3600;

    let mut ids = soroban_sdk::Vec::new(&env);
    ids.push_back(first);
    for _ in 0..4 {
        ids.push_back(h.escrow.deposit(
            &h.sender,
            &h.recipient,
            &1_000_000i128,
            &h.token,
            &expires_at,
        ));
    }

    assert_eq!(h.escrow.get_escrow_count(), 5u32);
    // Every ID is unique and resolves to its own Locked escrow.
    for (i, id) in ids.iter().enumerate() {
        assert_eq!(h.escrow.get_escrow(&id).status, EscrowStatus::Locked);
        for (j, other) in ids.iter().enumerate() {
            if i != j {
                assert_ne!(id, other);
            }
        }
    }
}

#[test]
fn test_concurrent_escrows_with_different_assets_are_independent() {
    let env = Env::default();
    let (h, id1) = setup(&env, 3600);

    // A second token contract, same escrow parameters otherwise.
    let token2 = MockToken.register(&env, None, ());
    let token2_client = MockTokenClient::new(&env, &token2);
    token2_client.mint(&h.sender, &10_000_000i128);

    let expires_at = env.ledger().timestamp() + 3600;
    let id2 = h.escrow.deposit(
        &h.sender,
        &h.recipient,
        &1_000_000i128,
        &token2,
        &expires_at,
    );

    assert_ne!(id1, id2);
    assert_eq!(h.escrow.get_escrow(&id1).asset, h.token);
    assert_eq!(h.escrow.get_escrow(&id2).asset, token2);
}
