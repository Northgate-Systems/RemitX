//! Unit tests for the RemitX Governance Contract.

#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, Bytes, Env, Symbol};

// ---------------------------------------------------------------------------
// Minimal mock token contract (test-only).
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

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&MockTokenDataKey::Balance(id))
            .unwrap_or(0)
    }

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

/// Total supply minted across all voters in the harness.
const TOTAL_SUPPLY: i128 = 1_000_000;
/// One-hour voting window (the minimum allowed).
const VOTING_PERIOD: u64 = 60 * 60;

struct TestHarness<'a> {
    gov: GovernanceContractClient<'a>,
    token: MockTokenClient<'a>,
    alice: Address,
    bob: Address,
    carol: Address,
}

fn setup(env: &Env) -> TestHarness<'_> {
    env.mock_all_auths();

    let token = MockTokenClient::new(env, &env.register(MockToken, ()));

    // Weighted voters: alice 600k, bob 300k, carol 100k = 1M supply.
    let alice = Address::generate(env);
    let bob = Address::generate(env);
    let carol = Address::generate(env);
    token.mint(&alice, &600_000i128);
    token.mint(&bob, &300_000i128);
    token.mint(&carol, &100_000i128);

    let gov_id = env.register(
        GovernanceContract,
        (token.address.clone(), TOTAL_SUPPLY),
    );
    let gov = GovernanceContractClient::new(env, &gov_id);

    TestHarness {
        gov,
        token,
        alice,
        bob,
        carol,
    }
}

fn description(env: &Env) -> Bytes {
    Bytes::from_slice(env, b"Upgrade the remittance fee logic to support tiered pricing")
}

fn title() -> Symbol {
    symbol_short!("upgrade")
}

/// Create a proposal from alice that is open for voting.
fn create_proposal(h: &TestHarness) -> u32 {
    h.gov
        .propose(&h.alice, &title(), &description(&h.gov.env), &VOTING_PERIOD)
}

// ---------------------------------------------------------------------------
// propose() tests
// ---------------------------------------------------------------------------

#[test]
fn test_propose() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    assert_eq!(id, 1);
    assert_eq!(h.gov.get_proposal_count(), 1);

    let p = h.gov.get_proposal(&id);
    assert_eq!(p.proposer, h.alice);
    assert_eq!(p.yes_votes, 0);
    assert_eq!(p.no_votes, 0);
    assert!(!p.executed);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Active);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_propose_empty_description_panics() {
    let env = Env::default();
    let h = setup(&env);
    let empty = Bytes::new(&env);
    h.gov.propose(&h.alice, &title(), &empty, &VOTING_PERIOD);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_propose_period_too_short_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.gov
        .propose(&h.alice, &title(), &description(&env), &60u64); // < 1 hour
}

// ---------------------------------------------------------------------------
// vote() tests
// ---------------------------------------------------------------------------

#[test]
fn test_vote_records_weight() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);

    let w = h.gov.vote(&h.alice, &id, &true);
    assert_eq!(w, 600_000i128); // alice's balance is her voting power
    let p = h.gov.get_proposal(&id);
    assert_eq!(p.yes_votes, 600_000i128);
    assert_eq!(p.no_votes, 0);
    assert!(h.gov.has_voted(&id, &h.alice));
    assert!(!h.gov.has_voted(&id, &h.bob));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_double_vote_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    h.gov.vote(&h.alice, &id, &true);
    h.gov.vote(&h.alice, &id, &false);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_vote_after_close_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    env.ledger().set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    h.gov.vote(&h.alice, &id, &true);
}

// ---------------------------------------------------------------------------
// execute() tests
// ---------------------------------------------------------------------------

#[test]
fn test_execute_passed_proposal() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);

    // alice (600k yes) + carol (100k yes) meet quorum (4% of 1M = 40k).
    h.gov.vote(&h.alice, &id, &true);
    h.gov.vote(&h.carol, &id, &true);

    env.ledger().set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Passed);

    let p = h.gov.execute(&id);
    assert!(p.executed);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_execute_before_close_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    h.gov.vote(&h.alice, &id, &true);
    // Still within the voting window.
    h.gov.execute(&id);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_execute_twice_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    h.gov.vote(&h.alice, &id, &true);
    env.ledger().set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    h.gov.execute(&id);
    h.gov.execute(&id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_execute_rejected_proposal_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);

    // Rejection: more no than yes.
    h.gov.vote(&h.bob, &id, &false); // 300k no
    h.gov.vote(&h.carol, &id, &true); // 100k yes

    env.ledger().set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Rejected);
    h.gov.execute(&id);
}

// ---------------------------------------------------------------------------
// Voting power tests
// ---------------------------------------------------------------------------

#[test]
fn test_voting_power_follows_balance() {
    let env = Env::default();
    let h = setup(&env);
    assert_eq!(h.gov.get_voting_power(&h.alice), 600_000i128);
    assert_eq!(h.gov.get_voting_power(&h.bob), 300_000i128);

    // Transferring tokens moves voting power with them.
    h.token.transfer(&h.alice, &h.bob, &100_000i128);
    assert_eq!(h.gov.get_voting_power(&h.alice), 500_000i128);
    assert_eq!(h.gov.get_voting_power(&h.bob), 400_000i128);
}