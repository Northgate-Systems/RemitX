//! Unit tests for the RemitX Governance Contract.

#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};

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
/// Delay before a proposal's voting window opens. Proposals are `Pending`
/// during this delay, giving the proposer a reachable cancellation window.
const VOTING_DELAY: u64 = 60 * 60;
/// Two-hour voting window (must exceed the voting delay).
const VOTING_PERIOD: u64 = 2 * 60 * 60;

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
        (Address::generate(env), token.address.clone(), TOTAL_SUPPLY),
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

/// Like [`setup`] but without `mock_all_auths`, so `require_auth` is
/// actually enforced. Used for negative authorization tests.
fn setup_no_auth(
    env: &Env,
) -> (
    GovernanceContractClient<'_>,
    MockTokenClient<'_>,
    Address,
    Address,
) {
    let token = MockTokenClient::new(env, &env.register(MockToken, ()));

    let admin = Address::generate(env);
    let proposer = Address::generate(env);
    let intruder = Address::generate(env);
    token.mint(&admin, &TOTAL_SUPPLY);

    let gov_id = env.register(
        GovernanceContract,
        (admin.clone(), token.address.clone(), TOTAL_SUPPLY),
    );
    let gov = GovernanceContractClient::new(env, &gov_id);

    (gov, token, proposer, intruder)
}

fn description(env: &Env) -> Bytes {
    Bytes::from_slice(
        env,
        b"Upgrade the remittance fee logic to support tiered pricing",
    )
}

fn action(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn title() -> Symbol {
    symbol_short!("upgrade")
}

/// Create a proposal from alice that is open for voting.
fn create_proposal(h: &TestHarness) -> u32 {
    h.gov.propose(
        &h.alice,
        &title(),
        &description(&h.gov.env),
        &action(&h.gov.env),
        &VOTING_PERIOD,
    )
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
    // Voting has not opened yet (it starts after the voting delay).
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Pending);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_propose_empty_description_panics() {
    let env = Env::default();
    let h = setup(&env);
    let empty = Bytes::new(&env);
    h.gov
        .propose(&h.alice, &title(), &empty, &action(&env), &VOTING_PERIOD);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_propose_period_too_short_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.gov.propose(
        &h.alice,
        &title(),
        &description(&env),
        &action(&env),
        &60u64,
    ); // < 1 hour
}

// ---------------------------------------------------------------------------
// vote() tests
// ---------------------------------------------------------------------------

#[test]
fn test_vote_records_weight() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    // Voting opens after the voting delay.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);

    let w = h.gov.vote(&h.alice, &id, &true).voting_power;
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
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);
    h.gov.vote(&h.alice, &id, &true);
    h.gov.vote(&h.alice, &id, &false);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_vote_after_close_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
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
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);

    // alice (600k yes) + carol (100k yes) meet quorum (4% of 1M = 40k).
    h.gov.vote(&h.alice, &id, &true);
    h.gov.vote(&h.carol, &id, &true);

    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Passed);

    let p = h.gov.execute(&id);
    assert!(p.success);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_execute_before_close_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);
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
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);
    h.gov.vote(&h.alice, &id, &true);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    h.gov.execute(&id);
    h.gov.execute(&id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_execute_rejected_proposal_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);

    // Rejection: more no than yes.
    h.gov.vote(&h.bob, &id, &false); // 300k no
    h.gov.vote(&h.carol, &id, &true); // 100k yes

    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_PERIOD + 1);
    assert_eq!(h.gov.get_status(&id), ProposalStatus::Rejected);
    h.gov.execute(&id);
}

// ---------------------------------------------------------------------------
// Authorization tests: require_auth is enforced (no mock_all_auths)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_set_quorum_requires_auth() {
    let env = Env::default();
    let (gov, _token, _admin, intruder) = setup_no_auth(&env);
    gov.set_quorum(&intruder, &400u32);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_extend_voting_requires_auth() {
    let env = Env::default();
    let (gov, _token, _admin, intruder) = setup_no_auth(&env);
    gov.extend_voting(&intruder, &1, &3600u64);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_cancel_requires_auth() {
    let env = Env::default();
    let (gov, _token, _admin, intruder) = setup_no_auth(&env);
    gov.cancel(&intruder, &1);
}

// ---------------------------------------------------------------------------
// set_quorum() tests
// ---------------------------------------------------------------------------

#[test]
fn test_set_quorum_admin_succeeds() {
    let env = Env::default();
    let h = setup(&env);
    let admin = h.gov.get_admin();
    h.gov.set_quorum(&admin, &1_000u32);
    assert_eq!(h.gov.get_quorum(), 1_000u32);
}

// ---------------------------------------------------------------------------
// cancel() tests
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_proposer_during_delay_window() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h); // proposer is alice

    // Cancel while voting has not started yet (within the delay window).
    h.gov.cancel(&h.alice, &id);
    assert!(h.gov.get_proposal(&id).cancelled);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_cancel_after_voting_starts_fails() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);

    // Advance past voting_starts; cancellation is no longer reachable.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);
    h.gov.cancel(&h.alice, &id);
}

// ---------------------------------------------------------------------------
// extend_voting() tests
// ---------------------------------------------------------------------------

#[test]
fn test_extend_voting_capped_at_max_period() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    let p = h.gov.get_proposal(&id);
    let max_ends = p.created_at + MAX_VOTING_PERIOD;
    let admin = h.gov.get_admin();

    // Extending by the full maximum period cannot push voting_ends past
    // `created_at + MAX_VOTING_PERIOD`.
    h.gov.extend_voting(&admin, &id, &MAX_VOTING_PERIOD);
    let p = h.gov.get_proposal(&id);
    assert_eq!(p.voting_ends, max_ends);
}

// ---------------------------------------------------------------------------
// Zero-balance tests (dedicated ZeroBalance error)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn test_propose_zero_balance_panics() {
    let env = Env::default();
    let h = setup(&env);
    let broke = Address::generate(&env);
    h.gov.propose(
        &broke,
        &title(),
        &description(&env),
        &action(&env),
        &VOTING_PERIOD,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn test_vote_zero_balance_panics() {
    let env = Env::default();
    let h = setup(&env);
    let id = create_proposal(&h);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + VOTING_DELAY + 1);
    let broke = Address::generate(&env);
    h.gov.vote(&broke, &id, &true);
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
