//! RemitX Staking Contract
//!
//! Stake a token to earn rewards funded by the platform:
//! - Positions accrue rewards continuously at a configurable APR (basis points)
//! - Rewards are paid from a pool funded by the admin (same staked token)
//! - Principal can be withdrawn at any time; rewards accrue until claimed
//! - Admin controls APR and reward-pool funding

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, panic_with_error, symbol_short, token, Address, Env};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum StakeError {
    InvalidAmount = 1,
    NothingStaked = 2,
    NotAdmin = 3,
    InsufficientStake = 4,
    InsufficientRewards = 5,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECONDS_PER_YEAR: i128 = 365 * 24 * 60 * 60;
/// Maximum APR: 100% (10_000 bps).
const MAX_APR_BPS: u32 = 10_000;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum StorageKey {
    Stake(Address),
    Token,
    TotalStaked,
    Admin,
    AprBps,
    RewardPool,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct StakePosition {
    pub amount: i128,
    pub pending_rewards: i128,
    pub last_update: u64,
    pub staked_at: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct StakingContract;

#[contractimpl]
impl StakingContract {
    /// Initialize the staking pool with a staked token and an admin.
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&StorageKey::Admin, &admin);
        env.storage().instance().set(&StorageKey::Token, &token);
        env.storage().instance().set(&StorageKey::AprBps, &1_000u32); // 10% default
        env.storage().instance().set(&StorageKey::RewardPool, &0i128);
        env.storage().persistent().set(&StorageKey::TotalStaked, &0i128);
    }

    /// Stake `amount` tokens from `staker` (requires token approval).
    pub fn stake(env: Env, staker: Address, amount: i128) -> StakePosition {
        staker.require_auth();
        if amount <= 0 {
            panic_with_error!(env, StakeError::InvalidAmount);
        }

        let mut pos = Self::load_position(&env, &staker);
        Self::accrue(&env, &mut pos);

        pos.amount += amount;
        if pos.staked_at == 0 {
            pos.staked_at = env.ledger().timestamp();
        }
        pos.last_update = env.ledger().timestamp();

        let contract = env.current_contract_address();
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Token)
            .expect("token not set");
        token::Client::new(&env, &token_addr).transfer(&staker, &contract, &amount);

        let total: i128 = env
            .storage()
            .persistent()
            .get(&StorageKey::TotalStaked)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&StorageKey::TotalStaked, &(total + amount));
        env.storage()
            .persistent()
            .set(&StorageKey::Stake(staker.clone()), &pos);

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("stake"), staker),
            amount,
        );

        pos
    }

    /// Withdraw `amount` principal from `staker`'s position. Rewards accrued
    /// up to this point remain claimable.
    pub fn withdraw(env: Env, staker: Address, amount: i128) -> StakePosition {
        staker.require_auth();
        if amount <= 0 {
            panic_with_error!(env, StakeError::InvalidAmount);
        }

        let mut pos = Self::load_position(&env, &staker);
        Self::accrue(&env, &mut pos);
        if pos.amount < amount {
            panic_with_error!(env, StakeError::InsufficientStake);
        }

        pos.amount -= amount;
        pos.last_update = env.ledger().timestamp();

        let token_addr = Self::token(&env);
        let contract = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&contract, &staker, &amount);

        let total: i128 = env
            .storage()
            .persistent()
            .get(&StorageKey::TotalStaked)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&StorageKey::TotalStaked, &(total - amount));
        env.storage()
            .persistent()
            .set(&StorageKey::Stake(staker.clone()), &pos);

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("withdraw"), staker),
            amount,
        );

        pos
    }

    /// Claim all accrued rewards for `staker`, paid from the reward pool.
    pub fn claim_rewards(env: Env, staker: Address) -> i128 {
        staker.require_auth();

        let mut pos = Self::load_position(&env, &staker);
        Self::accrue(&env, &mut pos);
        let reward = pos.pending_rewards;
        if reward <= 0 {
            panic_with_error!(env, StakeError::NothingStaked);
        }

        let pool: i128 = env
            .storage()
            .instance()
            .get(&StorageKey::RewardPool)
            .unwrap_or(0);
        if pool < reward {
            panic_with_error!(env, StakeError::InsufficientRewards);
        }

        pos.pending_rewards = 0;
        pos.last_update = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&StorageKey::Stake(staker.clone()), &pos);
        env.storage()
            .instance()
            .set(&StorageKey::RewardPool, &(pool - reward));

        let token_addr = Self::token(&env);
        let contract = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&contract, &staker, &reward);

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("claim"), staker),
            reward,
        );

        reward
    }

    /// Set the reward APR in basis points (admin only, capped at 100%).
    pub fn set_apr(env: Env, caller: Address, apr_bps: u32) {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set");
        if caller != admin {
            panic_with_error!(env, StakeError::NotAdmin);
        }
        if apr_bps > MAX_APR_BPS {
            panic_with_error!(env, StakeError::InvalidAmount);
        }
        env.storage().instance().set(&StorageKey::AprBps, &apr_bps);
        env.events()
            .publish((symbol_short!("staking"), symbol_short!("apr")), apr_bps);
    }

    /// Fund the reward pool with `amount` tokens from `funder`.
    pub fn fund_rewards(env: Env, funder: Address, amount: i128) -> i128 {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(env, StakeError::InvalidAmount);
        }

        let contract = env.current_contract_address();
        let token_addr = Self::token(&env);
        token::Client::new(&env, &token_addr).transfer(&funder, &contract, &amount);

        let pool: i128 = env
            .storage()
            .instance()
            .get(&StorageKey::RewardPool)
            .unwrap_or(0);
        let new_pool = pool + amount;
        env.storage()
            .instance()
            .set(&StorageKey::RewardPool, &new_pool);

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("fund"), funder),
            amount,
        );

        new_pool
    }

    // -----------------------------------------------------------------------
    // Read-only getters
    // -----------------------------------------------------------------------

    /// Get a staker's position with rewards accrued to the current timestamp
    /// (read-only; does not persist).
    pub fn get_stake(env: Env, staker: Address) -> StakePosition {
        let mut pos = Self::load_position(&env, &staker);
        Self::accrue(&env, &mut pos);
        pos
    }

    /// Total principal staked across all users (read-only).
    pub fn get_total_staked(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::TotalStaked)
            .unwrap_or(0)
    }

    /// Remaining reward pool balance (read-only).
    pub fn get_reward_pool(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&StorageKey::RewardPool)
            .unwrap_or(0)
    }

    /// Current APR in basis points (read-only).
    pub fn get_apr(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::AprBps)
            .unwrap_or(1_000)
    }

    /// Current admin address (read-only).
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set")
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Token)
            .expect("token not set")
    }

    fn load_position(env: &Env, staker: &Address) -> StakePosition {
        env.storage()
            .persistent()
            .get(&StorageKey::Stake(staker.clone()))
            .unwrap_or(StakePosition {
                amount: 0,
                pending_rewards: 0,
                last_update: env.ledger().timestamp(),
                staked_at: 0,
            })
    }

    /// Accrue rewards for the elapsed time since `pos.last_update` at the
    /// current APR. Does not persist — callers decide when to save.
    fn accrue(env: &Env, pos: &mut StakePosition) {
        let now = env.ledger().timestamp();
        if now <= pos.last_update || pos.amount <= 0 {
            pos.last_update = now;
            return;
        }
        let apr_bps: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::AprBps)
            .unwrap_or(1_000);
        let elapsed = (now - pos.last_update) as i128;
        let reward = pos.amount * elapsed * apr_bps as i128 / (10_000 * SECONDS_PER_YEAR);
        pos.pending_rewards += reward;
        pos.last_update = now;
    }
}

#[cfg(test)]
mod test;