//! Unit tests for the RemitX Staking Contract.

#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, Env};

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

struct TestHarness<'a> {
    staking: StakingContractClient<'a>,
    token: MockTokenClient<'a>,
    admin: Address,
    staker: Address,
    other: Address,
}

const YEAR: u64 = 365 * 24 * 60 * 60;

fn setup(env: &Env) -> TestHarness<'_> {
    env.mock_all_auths();

    let token = MockTokenClient::new(env, &env.register(MockToken, ()));
    let admin = Address::generate(env);
    let staker = Address::generate(env);
    let other = Address::generate(env);

    token.mint(&staker, &10_000_000i128);
    token.mint(&admin, &10_000_000i128);

    let staking = StakingContractClient::new(
        env,
        &env.register(StakingContract, (admin.clone(), token.address.clone())),
    );

    TestHarness {
        staking,
        token,
        admin,
        staker,
        other,
    }
}

// ---------------------------------------------------------------------------
// stake() tests
// ---------------------------------------------------------------------------

#[test]
fn test_stake() {
    let env = Env::default();
    let h = setup(&env);

    let pos = h.staking.stake(&h.staker, &1_000_000i128);
    assert_eq!(pos.amount, 1_000_000i128);
    assert_eq!(pos.pending_rewards, 0);
    assert_eq!(h.staking.get_total_staked(), 1_000_000i128);

    // Tokens moved to the staking contract.
    let contract = h.staking.address;
    assert_eq!(h.token.balance(&h.staker), 9_000_000i128);
    assert_eq!(h.token.balance(&contract), 1_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_stake_zero_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.stake(&h.staker, &0i128);
}

// ---------------------------------------------------------------------------
// Reward accrual / claim tests
// ---------------------------------------------------------------------------

#[test]
fn test_rewards_accrue_and_claim() {
    let env = Env::default();
    let h = setup(&env);

    h.staking.stake(&h.staker, &1_000_000i128);
    // Fund rewards: pool must cover the claim.
    h.staking.fund_rewards(&h.admin, &200_000i128);
    assert_eq!(h.staking.get_reward_pool(), 200_000i128);

    // One year at the default 10% APR: 1_000_000 * 10% = 100_000.
    env.ledger().set_timestamp(env.ledger().timestamp() + YEAR);
    let pos = h.staking.get_stake(&h.staker);
    assert_eq!(pos.pending_rewards, 100_000i128);

    let claimed = h.staking.claim_rewards(&h.staker);
    assert_eq!(claimed, 100_000i128);
    // 10_000_000 initial − 1_000_000 still staked in the contract + 100_000 claimed.
    assert_eq!(h.token.balance(&h.staker), 9_100_000i128);
    assert_eq!(h.staking.get_reward_pool(), 100_000i128);
    assert_eq!(h.staking.get_stake(&h.staker).pending_rewards, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_claim_without_funded_pool_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.stake(&h.staker, &1_000_000i128);
    env.ledger().set_timestamp(env.ledger().timestamp() + YEAR);
    // Pool is empty; rewards are owed but unfundable.
    h.staking.claim_rewards(&h.staker);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_claim_with_no_position_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.claim_rewards(&h.other);
}

// ---------------------------------------------------------------------------
// withdraw() tests
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_partial() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.stake(&h.staker, &1_000_000i128);

    let pos = h.staking.withdraw(&h.staker, &400_000i128);
    assert_eq!(pos.amount, 600_000i128);
    assert_eq!(h.staking.get_total_staked(), 600_000i128);
    assert_eq!(h.token.balance(&h.staker), 9_400_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_withdraw_more_than_staked_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.stake(&h.staker, &1_000_000i128);
    h.staking.withdraw(&h.staker, &2_000_000i128);
}

// ---------------------------------------------------------------------------
// Admin tests
// ---------------------------------------------------------------------------

#[test]
fn test_set_apr() {
    let env = Env::default();
    let h = setup(&env);
    assert_eq!(h.staking.get_apr(), 1_000u32); // 10% default

    h.staking.set_apr(&h.admin, &500u32);
    assert_eq!(h.staking.get_apr(), 500u32);
    assert_eq!(h.staking.get_admin(), h.admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_set_apr_non_admin_panics() {
    let env = Env::default();
    let h = setup(&env);
    h.staking.set_apr(&h.other, &500u32);
}