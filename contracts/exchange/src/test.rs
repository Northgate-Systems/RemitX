//! Unit tests for the RemitX Exchange Contract (constant-product AMM).

#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

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
    exchange: ExchangeContractClient<'a>,
    base: MockTokenClient<'a>,
    quote: MockTokenClient<'a>,
    lp: Address,
    trader: Address,
    pair_id: BytesN<32>,
}

const FEE_BPS: u32 = 30; // 0.3%

fn setup(env: &Env) -> TestHarness<'_> {
    env.mock_all_auths();

    let base = MockTokenClient::new(env, &env.register(MockToken, ()));
    let quote = MockTokenClient::new(env, &env.register(MockToken, ()));
    let exchange =
        ExchangeContractClient::new(env, &env.register(ExchangeContract, ()));

    let lp = Address::generate(env);
    let trader = Address::generate(env);
    base.mint(&lp, &1_000_000i128);
    quote.mint(&lp, &4_000_000i128);
    base.mint(&trader, &100_000i128);

    let pair_id = exchange.create_pair(&base.address, &quote.address, &FEE_BPS);

    TestHarness {
        exchange,
        base,
        quote,
        lp,
        trader,
        pair_id,
    }
}

/// Add initial liquidity: 100_000 base / 400_000 quote.
fn seed_liquidity(h: &TestHarness) {
    h.exchange
        .add_liquidity(&h.lp, &h.pair_id, &100_000i128, &400_000i128, &100_000i128);
}

// ---------------------------------------------------------------------------
// create_pair() tests
// ---------------------------------------------------------------------------

#[test]
fn test_create_pair() {
    let env = Env::default();
    let h = setup(&env);
    assert_eq!(h.exchange.get_pair_count(), 1);

    let pair = h.exchange.get_pair(&h.pair_id);
    assert_eq!(pair.base, h.base.address);
    assert_eq!(pair.quote, h.quote.address);
    assert_eq!(pair.fee_bps, FEE_BPS);
    assert_eq!(pair.total_shares, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_create_duplicate_pair_panics() {
    let env = Env::default();
    let h = setup(&env);
    // Same pair, reversed argument order, must collide.
    h.exchange.create_pair(&h.quote.address, &h.base.address, &FEE_BPS);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_create_pair_fee_too_high_panics() {
    let env = Env::default();
    let h = setup(&env);
    let other = Address::generate(&env);
    h.exchange.create_pair(&h.base.address, &other, &101u32);
}

// ---------------------------------------------------------------------------
// add_liquidity() / remove_liquidity() tests
// ---------------------------------------------------------------------------

#[test]
fn test_add_liquidity() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);

    assert_eq!(h.exchange.get_shares(&h.pair_id, &h.lp), 100_000i128);
    let pair = h.exchange.get_pair(&h.pair_id);
    assert_eq!(pair.base_reserve, 100_000i128);
    assert_eq!(pair.quote_reserve, 400_000i128);
    assert_eq!(pair.total_shares, 100_000i128);

    // Assets moved into the exchange contract.
    assert_eq!(h.base.balance(&h.lp), 900_000i128);
    assert_eq!(h.quote.balance(&h.lp), 3_600_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_add_liquidity_slippage_guard_panics() {
    let env = Env::default();
    let h = setup(&env);
    // Demand more shares than the bootstrap mint will produce.
    h.exchange
        .add_liquidity(&h.lp, &h.pair_id, &100_000i128, &400_000i128, &200_000i128);
}

#[test]
fn test_remove_liquidity() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);

    // Burn all shares; pool is empty afterwards.
    let (base_out, quote_out) =
        h.exchange
            .remove_liquidity(&h.lp, &h.pair_id, &100_000i128, &1i128, &1i128);
    assert_eq!(base_out, 100_000i128);
    assert_eq!(quote_out, 400_000i128);
    assert_eq!(h.exchange.get_shares(&h.pair_id, &h.lp), 0);

    let pair = h.exchange.get_pair(&h.pair_id);
    assert_eq!(pair.total_shares, 0);
    assert_eq!(h.base.balance(&h.lp), 1_000_000i128);
    assert_eq!(h.quote.balance(&h.lp), 4_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_remove_more_shares_than_owned_panics() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);
    h.exchange
        .remove_liquidity(&h.lp, &h.pair_id, &200_000i128, &1i128, &1i128);
}

// ---------------------------------------------------------------------------
// swap() tests
// ---------------------------------------------------------------------------

#[test]
fn test_swap_base_for_quote() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);

    // 10_000 base in, expect >= 36_000 quote out.
    let result = h
        .exchange
        .swap(&h.trader, &h.pair_id, &h.base.address, &10_000i128, &36_000i128);
    assert_eq!(result.amount_in, 10_000i128);
    assert_eq!(result.amount_out, 36_264i128);
    assert_eq!(result.fee_bps, FEE_BPS);

    // Trader balances moved correctly.
    assert_eq!(h.base.balance(&h.trader), 90_000i128);
    assert_eq!(h.quote.balance(&h.trader), 36_264i128);

    // Reserves updated: base grew by input, quote shrank by output.
    let pair = h.exchange.get_pair(&h.pair_id);
    assert_eq!(pair.base_reserve, 110_000i128);
    assert_eq!(pair.quote_reserve, 363_736i128);

    // Constant product must not decrease (fee stays in the pool).
    assert!(pair.base_reserve * pair.quote_reserve >= 100_000i128 * 400_000i128);
}

#[test]
fn test_swap_quote_for_base() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);
    h.quote.mint(&h.trader, &40_000i128);

    let result = h
        .exchange
        .swap(&h.trader, &h.pair_id, &h.quote.address, &40_000i128, &1i128);
    // fee = 40_000*30/10_000 = 120; net = 39_880
    // out = 100_000*39_880 / (400_000+39_880) = 3_988_000_000/439_880 = 9_066
    assert_eq!(result.amount_out, 9_066i128);
    assert_eq!(h.base.balance(&h.trader), 109_066i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_swap_slippage_guard_panics() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);
    // Demand an output higher than the curve allows.
    h.exchange
        .swap(&h.trader, &h.pair_id, &h.base.address, &10_000i128, &50_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_swap_invalid_token_panics() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);
    // LP address is not a member of the pair.
    h.exchange
        .swap(&h.trader, &h.pair_id, &h.lp, &10_000i128, &1i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_swap_empty_pool_panics() {
    let env = Env::default();
    let h = setup(&env);
    // Pair exists but has no liquidity.
    h.exchange
        .swap(&h.trader, &h.pair_id, &h.base.address, &10_000i128, &1i128);
}

// ---------------------------------------------------------------------------
// get_rate() tests
// ---------------------------------------------------------------------------

#[test]
fn test_get_rate() {
    let env = Env::default();
    let h = setup(&env);
    seed_liquidity(&h);

    // 400_000 quote / 100_000 base = 4.0, scaled by 1e9.
    let rate = h.exchange.get_rate(&h.base.address, &h.quote.address);
    assert_eq!(rate, 4_000_000_000i128);
}