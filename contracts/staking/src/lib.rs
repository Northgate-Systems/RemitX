//! RemitX Staking Contract
//!
//! Stake a token to earn rewards funded by the platform:
//! - Positions accrue rewards continuously at a configurable APR (basis points)
//! - Rewards are paid from a pool funded by the admin (same staked token)
//! - Principal can be withdrawn at any time; rewards accrue until claimed
//! - Admin controls APR and reward-pool funding
//! - Partial unstake with reward accrual
//! - Reward claiming without unstaking
//! - Emergency pause for admin
//! - Slashing mechanism for malicious actors
//! - Detailed position history for indexers

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, token, Address, Env, Vec,
};

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
    Paused = 6,
    InvalidApr = 7,
    ZeroAddress = 8,
    InsufficientPool = 9,
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
    Paused,
    StakerList(Vec<Address>),
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
    pub last_reward_claim: u64,
    pub total_rewards_claimed: i128,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct StakeResult {
    pub staker: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct UnstakeResult {
    pub staker: Address,
    pub amount: i128,
    pub rewards_claimed: i128,
    pub timestamp: u64,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct ClaimResult {
    pub staker: Address,
    pub rewards_claimed: i128,
    pub timestamp: u64,
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
        env.storage()
            .persistent()
            .set(&StorageKey::TotalStaked, &0i128);
        env.storage().instance().set(&StorageKey::Paused, &false);
        env.storage()
            .instance()
            .set(&StorageKey::StakerList, &Vec::new(&env));
    }

    /// Stake `amount` tokens from `staker` (requires token approval).
    pub fn stake(env: Env, staker: Address, amount: i128) -> StakeResult {
        if staker == Address::from_string(&env, "").unwrap() {
            panic_with_error!(env, StakeError::ZeroAddress);
        }
        if env
            .storage()
            .instance()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(env, StakeError::Paused);
        }
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

        // Track staker in global list.
        let mut stakers: Vec<Address> = env
            .storage()
            .instance()
            .get(&StorageKey::StakerList)
            .unwrap_or(Vec::new(&env));
        if !stakers.contains(&staker) {
            stakers.push_back(staker.clone());
            env.storage()
                .instance()
                .set(&StorageKey::StakerList, &stakers);
        }

        let result = StakeResult {
            staker,
            amount,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("stake"), result.staker.clone()),
            amount,
        );

        result
    }

    /// Withdraw `amount` principal from `staker`'s position. Rewards accrued
    /// up to this point remain claimable.
    pub fn withdraw(env: Env, staker: Address, amount: i128) -> UnstakeResult {
        if env
            .storage()
            .instance()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(env, StakeError::Paused);
        }
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

        let result = UnstakeResult {
            staker,
            amount,
            rewards_claimed: 0,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("withdraw"), staker),
            amount,
        );

        result
    }

    /// Claim all accrued rewards for `staker`, paid from the reward pool.
    pub fn claim_rewards(env: Env, staker: Address) -> ClaimResult {
        if env
            .storage()
            .instance()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(env, StakeError::Paused);
        }
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
        pos.last_reward_claim = env.ledger().timestamp();
        pos.total_rewards_claimed += reward;
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

        let result = ClaimResult {
            staker,
            rewards_claimed: reward,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("claim"), staker),
            reward,
        );

        result
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

    /// Pause or unpause the contract. Admin-only. When paused, all
    /// staking/withdrawal/claim operations are rejected.
    pub fn set_paused(env: Env, caller: Address, paused: bool) {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set");
        if caller != admin {
            panic_with_error!(env, StakeError::NotAdmin);
        }
        env.storage().instance().set(&StorageKey::Paused, &paused);
    }

    /// Slash a staker's balance by `amount` (admin only). Used for
    /// penalty enforcement.
    pub fn slash(env: Env, caller: Address, target: Address, amount: i128) {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set");
        if caller != admin {
            panic_with_error!(env, StakeError::NotAdmin);
        }
        if amount <= 0 {
            panic_with_error!(env, StakeError::InvalidAmount);
        }

        let mut pos = Self::load_position(&env, &target);
        Self::accrue(&env, &mut pos);
        if pos.amount < amount {
            panic_with_error!(env, StakeError::InsufficientStake);
        }

        pos.amount -= amount;
        pos.last_update = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&StorageKey::Stake(target.clone()), &pos);

        let total: i128 = env
            .storage()
            .persistent()
            .get(&StorageKey::TotalStaked)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&StorageKey::TotalStaked, &(total - amount));

        env.events().publish(
            (symbol_short!("staking"), symbol_short!("slash"), target),
            amount,
        );
    }

    /// Get the list of all stakers (read-only).
    pub fn get_stakers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&StorageKey::StakerList)
            .unwrap_or(Vec::new(&env))
    }

    /// Check whether the contract is paused (read-only).
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
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
                last_reward_claim: 0,
                total_rewards_claimed: 0,
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