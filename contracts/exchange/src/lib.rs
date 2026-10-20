//! RemitX Exchange Contract
//!
//! Constant-product (x*y=k) AMM for swapping between issued assets, with:
//! - Per-pair fee configuration (basis points, capped)
//! - Liquidity provision with share accounting per provider
//! - Slippage protection via minimum-output parameters
//! - Fixed-point (1e9) rate quotes for off-chain consumers
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
pub enum ExchangeError {
    InvalidAmount = 1,
    PairNotFound = 2,
    InsufficientLiquidity = 3,
    SlippageExceeded = 4,
    PairExists = 5,
    InvalidFee = 6,
    InvalidToken = 7,
    InsufficientShares = 8,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum swap fee: 1% (100 bps).
const MAX_FEE_BPS: u32 = 100;
/// Fixed-point scaling factor for rates (1e9).
const RATE_SCALE: i128 = 1_000_000_000;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum StorageKey {
    Pair(BytesN<32>),
    PairCount,
    Shares(BytesN<32>, Address),
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct ExchangePair {
    pub base: Address,
    pub quote: Address,
    pub base_reserve: i128,
    pub quote_reserve: i128,
    pub total_shares: i128,
    pub fee_bps: u32,
    pub created_at: u64,
    pub last_update: u64,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct SwapResult {
    pub pair_id: BytesN<32>,
    pub amount_in: i128,
    pub amount_out: i128,
    pub fee_bps: u32,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct ExchangeContract;

#[contractimpl]
impl ExchangeContract {
    /// Create a new trading pair. Permissionless, but the fee is capped.
    pub fn create_pair(env: Env, base: Address, quote: Address, fee_bps: u32) -> BytesN<32> {
        if base == quote {
            panic_with_error!(env, ExchangeError::InvalidToken);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(env, ExchangeError::InvalidFee);
        }

        let pair_id = Self::compute_pair_id(&env, &base, &quote);
        if env
            .storage()
            .persistent()
            .has(&StorageKey::Pair(pair_id.clone()))
        {
            panic_with_error!(env, ExchangeError::PairExists);
        }

        let pair = ExchangePair {
            base: base.clone(),
            quote: quote.clone(),
            base_reserve: 0,
            quote_reserve: 0,
            total_shares: 0,
            fee_bps,
            created_at: env.ledger().timestamp(),
            last_update: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&StorageKey::Pair(pair_id.clone()), &pair);

        let count: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::PairCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&StorageKey::PairCount, &(count + 1));

        env.events().publish(
            (symbol_short!("exchange"), symbol_short!("new_pair"), pair_id.clone()),
            (base, quote, fee_bps),
        );

        pair_id
    }

    /// Add liquidity to a pair. The provider must have approved both tokens.
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        pair_id: BytesN<32>,
        base_amount: i128,
        quote_amount: i128,
        min_shares: i128,
    ) -> i128 {
        provider.require_auth();
        if base_amount <= 0 || quote_amount <= 0 {
            panic_with_error!(env, ExchangeError::InvalidAmount);
        }

        let mut pair = Self::load_pair(&env, &pair_id);
        let contract = env.current_contract_address();

        // Pull both assets into the pool.
        token::Client::new(&env, &pair.base).transfer(&provider, &contract, &base_amount);
        token::Client::new(&env, &pair.quote).transfer(&provider, &contract, &quote_amount);

        let shares = if pair.total_shares == 0 {
            // Bootstrap: shares equal the base deposit.
            base_amount
        } else {
            // Proportional mint: constrained by the tighter side.
            let by_base = base_amount * pair.total_shares / pair.base_reserve;
            let by_quote = quote_amount * pair.total_shares / pair.quote_reserve;
            if by_base < by_quote {
                by_base
            } else {
                by_quote
            }
        };
        if shares <= 0 || shares < min_shares {
            panic_with_error!(env, ExchangeError::SlippageExceeded);
        }

        pair.base_reserve += base_amount;
        pair.quote_reserve += quote_amount;
        pair.total_shares += shares;
        pair.last_update = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&StorageKey::Pair(pair_id.clone()), &pair);

        let shares_key = StorageKey::Shares(pair_id.clone(), provider.clone());
        let owned: i128 = env.storage().persistent().get(&shares_key).unwrap_or(0);
        env.storage().persistent().set(&shares_key, &(owned + shares));

        env.events().publish(
            (symbol_short!("exchange"), symbol_short!("add_liq"), pair_id.clone()),
            (provider, base_amount, quote_amount, shares),
        );

        shares
    }

    /// Remove liquidity from a pair, burning the provider's shares.
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        pair_id: BytesN<32>,
        shares: i128,
        min_base_out: i128,
        min_quote_out: i128,
    ) -> (i128, i128) {
        provider.require_auth();
        if shares <= 0 {
            panic_with_error!(env, ExchangeError::InvalidAmount);
        }

        let mut pair = Self::load_pair(&env, &pair_id);
        let shares_key = StorageKey::Shares(pair_id.clone(), provider.clone());
        let owned: i128 = env.storage().persistent().get(&shares_key).unwrap_or(0);
        if owned < shares {
            panic_with_error!(env, ExchangeError::InsufficientShares);
        }
        if pair.total_shares <= 0 {
            panic_with_error!(env, ExchangeError::InsufficientLiquidity);
        }

        let base_out = shares * pair.base_reserve / pair.total_shares;
        let quote_out = shares * pair.quote_reserve / pair.total_shares;
        if base_out < min_base_out || quote_out < min_quote_out {
            panic_with_error!(env, ExchangeError::SlippageExceeded);
        }

        pair.base_reserve -= base_out;
        pair.quote_reserve -= quote_out;
        pair.total_shares -= shares;
        pair.last_update = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&StorageKey::Pair(pair_id.clone()), &pair);

        let remaining = owned - shares;
        if remaining == 0 {
            env.storage().persistent().remove(&shares_key);
        } else {
            env.storage().persistent().set(&shares_key, &remaining);
        }

        let contract = env.current_contract_address();
        token::Client::new(&env, &pair.base).transfer(&contract, &provider, &base_out);
        token::Client::new(&env, &pair.quote).transfer(&contract, &provider, &quote_out);

        env.events().publish(
            (symbol_short!("exchange"), symbol_short!("rm_liq"), pair_id),
            (provider, shares, base_out, quote_out),
        );

        (base_out, quote_out)
    }

    /// Swap an exact input amount of `from_token` for the other side of the
    /// pair, enforcing `min_amount_out` slippage protection.
    pub fn swap(
        env: Env,
        sender: Address,
        pair_id: BytesN<32>,
        from_token: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> SwapResult {
        sender.require_auth();
        if amount_in <= 0 {
            panic_with_error!(env, ExchangeError::InvalidAmount);
        }

        let mut pair = Self::load_pair(&env, &pair_id);
        let selling_base = from_token == pair.base;
        let selling_quote = from_token == pair.quote;
        if !selling_base && !selling_quote {
            panic_with_error!(env, ExchangeError::InvalidToken);
        }

        let (res_in, res_out) = if selling_base {
            (pair.base_reserve, pair.quote_reserve)
        } else {
            (pair.quote_reserve, pair.base_reserve)
        };
        if res_in <= 0 || res_out <= 0 {
            panic_with_error!(env, ExchangeError::InsufficientLiquidity);
        }

        let contract = env.current_contract_address();
        token::Client::new(&env, &from_token).transfer(&sender, &contract, &amount_in);

        // Constant-product swap with fee retained in the pool.
        let fee = amount_in * pair.fee_bps as i128 / 10_000;
        let amount_in_net = amount_in - fee;
        let amount_out = res_out * amount_in_net / (res_in + amount_in_net);
        if amount_out <= 0 {
            panic_with_error!(env, ExchangeError::InsufficientLiquidity);
        }
        if amount_out < min_amount_out {
            panic_with_error!(env, ExchangeError::SlippageExceeded);
        }
        if amount_out >= res_out {
            panic_with_error!(env, ExchangeError::InsufficientLiquidity);
        }

        let to_token = if selling_base {
            pair.quote.clone()
        } else {
            pair.base.clone()
        };
        token::Client::new(&env, &to_token).transfer(&contract, &sender, &amount_out);

        if selling_base {
            pair.base_reserve += amount_in;
            pair.quote_reserve -= amount_out;
        } else {
            pair.quote_reserve += amount_in;
            pair.base_reserve -= amount_out;
        }
        pair.last_update = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&StorageKey::Pair(pair_id.clone()), &pair);

        let result = SwapResult {
            pair_id: pair_id.clone(),
            amount_in,
            amount_out,
            fee_bps: pair.fee_bps,
            timestamp: pair.last_update,
        };
        env.events().publish(
            (symbol_short!("exchange"), symbol_short!("swap"), pair_id),
            (sender, from_token, to_token, amount_in, amount_out),
        );

        result
    }

    /// Quote the current price of one unit of `base` in `quote` units,
    /// scaled by 1e9 (read-only).
    pub fn get_rate(env: Env, base: Address, quote: Address) -> i128 {
        let pair_id = Self::compute_pair_id(&env, &base, &quote);
        let pair = Self::load_pair(&env, &pair_id);
        if pair.base_reserve <= 0 {
            panic_with_error!(env, ExchangeError::InsufficientLiquidity);
        }
        pair.quote_reserve * RATE_SCALE / pair.base_reserve
    }

    /// Get a pair by ID (read-only).
    pub fn get_pair(env: Env, pair_id: BytesN<32>) -> ExchangePair {
        Self::load_pair(&env, &pair_id)
    }

    /// Get the number of pairs created (read-only).
    pub fn get_pair_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::PairCount)
            .unwrap_or(0)
    }

    /// Get a provider's share balance in a pair (read-only).
    pub fn get_shares(env: Env, pair_id: BytesN<32>, provider: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::Shares(pair_id, provider))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn load_pair(env: &Env, pair_id: &BytesN<32>) -> ExchangePair {
        env.storage()
            .persistent()
            .get(&StorageKey::Pair(pair_id.clone()))
            .expect("pair not found")
    }

    /// Order-insensitive pair ID: hash of the two assets' XDR encodings,
    /// normalized by hash comparison so (A,B) == (B,A).
    fn compute_pair_id(env: &Env, a: &Address, b: &Address) -> BytesN<32> {
        let ha = env.crypto().sha256(&a.to_xdr(env)).to_bytes();
        let hb = env.crypto().sha256(&b.to_xdr(env)).to_bytes();
        let (first, second) = if ha <= hb { (ha, hb) } else { (hb, ha) };
        let mut buf = Bytes::new(env);
        buf.append(&Bytes::from_slice(env, &first.to_array()));
        buf.append(&Bytes::from_slice(env, &second.to_array()));
        env.crypto().sha256(&buf).to_bytes()
    }
}

#[cfg(test)]
mod test;