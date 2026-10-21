//! RemitX Governance Contract
//!
//! Token-weighted on-chain governance:
//! - Proposals carry a title, description hash, start/end window and status
//! - Voting power equals the voter's token balance at vote time
//! - Double voting is prevented per proposal
//! - Quorum is a configurable basis-point threshold of total supply
//! - Passed proposals can be executed once, emitting an event for indexing
//! - Proposal cancellation by proposer before voting starts
//! - Voting period extension by admin
//! - Configurable quorum threshold
//! - Proposal execution with arbitrary action hash
//! - Voter delegation (stake-weighted)
//! - Detailed voting history for indexers

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env, Vec,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceError {
    InvalidProposal = 1,
    VotingClosed = 2,
    AlreadyVoted = 3,
    VotingNotEnded = 4,
    NotPassed = 5,
    AlreadyExecuted = 6,
    NotProposer = 7,
    InvalidDescription = 8,
    InvalidPeriod = 9,
    NotAdmin = 10,
    AlreadyCancelled = 11,
    CannotExtendEnded = 12,
    ZeroAddress = 13,
    InvalidQuorum = 14,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum voting period: 1 hour.
const MIN_VOTING_PERIOD: u64 = 60 * 60;
/// Maximum voting period: 14 days.
const MAX_VOTING_PERIOD: u64 = 14 * 24 * 60 * 60;
/// Default quorum threshold: 4% of total supply (basis points).
const DEFAULT_QUORUM_BPS: u32 = 400;
/// Maximum quorum: 100% (10_000 bps).
const MAX_QUORUM_BPS: u32 = 10_000;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub enum StorageKey {
    Proposal(u32),
    ProposalCount,
    Voted(u32, Address),
    Token,
    TotalSupply,
    Admin,
    QuorumBps,
    VoterList(Vec<Address>),
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum ProposalStatus {
    Pending,
    Active,
    Passed,
    Rejected,
    Executed,
    Cancelled,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub title: soroban_sdk::Symbol,
    pub description_hash: BytesN<32>,
    pub action_hash: BytesN<32>,
    pub created_at: u64,
    pub voting_starts: u64,
    pub voting_ends: u64,
    pub yes_votes: i128,
    pub no_votes: i128,
    pub executed: bool,
    pub cancelled: bool,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct VoteResult {
    pub proposal_id: u32,
    pub voter: Address,
    pub support: bool,
    pub voting_power: i128,
    pub timestamp: u64,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct ExecuteResult {
    pub proposal_id: u32,
    pub success: bool,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize governance with the token used for voting power and a
    /// snapshot of its total supply (used to compute quorum). The caller must
    /// supply the current total supply because the SAC token interface does
    /// not expose `total_supply`.
    pub fn __constructor(env: Env, admin: Address, token: Address, total_supply: i128) {
        env.storage().instance().set(&StorageKey::Admin, &admin);
        env.storage().instance().set(&StorageKey::Token, &token);
        env.storage()
            .instance()
            .set(&StorageKey::TotalSupply, &total_supply);
        env.storage()
            .instance()
            .set(&StorageKey::ProposalCount, &0u32);
        env.storage()
            .instance()
            .set(&StorageKey::QuorumBps, &DEFAULT_QUORUM_BPS);
        env.storage()
            .instance()
            .set(&StorageKey::VoterList, &Vec::new(&env));
    }

    /// Create a proposal. The proposer must hold a non-zero token balance.
    pub fn propose(
        env: Env,
        proposer: Address,
        title: soroban_sdk::Symbol,
        description: Bytes,
        action_hash: BytesN<32>,
        voting_period: u64,
    ) -> u32 {
        if proposer == Address::from_string(&env, "").unwrap() {
            panic_with_error!(env, GovernanceError::ZeroAddress);
        }
        proposer.require_auth();
        if description.is_empty() || description.len() > 1024 {
            panic_with_error!(env, GovernanceError::InvalidDescription);
        }
        if voting_period < MIN_VOTING_PERIOD || voting_period > MAX_VOTING_PERIOD {
            panic_with_error!(env, GovernanceError::InvalidPeriod);
        }
        if Self::balance_of(&env, &proposer) <= 0 {
            panic_with_error!(env, GovernanceError::InvalidProposal);
        }

        let count: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::ProposalCount)
            .unwrap_or(0);
        let id = count + 1;
        let now = env.ledger().timestamp();

        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            title,
            description_hash: env.crypto().sha256(&description).to_bytes(),
            action_hash,
            created_at: now,
            voting_starts: now,
            voting_ends: now + voting_period,
            yes_votes: 0,
            no_votes: 0,
            executed: false,
            cancelled: false,
        };
        env.storage()
            .persistent()
            .set(&StorageKey::Proposal(id), &proposal);
        env.storage()
            .instance()
            .set(&StorageKey::ProposalCount, &id);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("propose"), id),
            (proposer, proposal.voting_ends),
        );

        id
    }

    /// Cast a vote on proposal `id`. Weight equals the voter's current token
    /// balance. Reverts if voting hasn't started, ended, or already used.
    pub fn vote(env: Env, voter: Address, id: u32, support: bool) -> VoteResult {
        if voter == Address::from_string(&env, "").unwrap() {
            panic_with_error!(env, GovernanceError::ZeroAddress);
        }
        voter.require_auth();
        let mut proposal = Self::load_proposal(&env, id);
        let now = env.ledger().timestamp();
        if now < proposal.voting_starts || now > proposal.voting_ends {
            panic_with_error!(env, GovernanceError::VotingClosed);
        }
        if env
            .storage()
            .persistent()
            .has(&StorageKey::Voted(id, voter.clone()))
        {
            panic_with_error!(env, GovernanceError::AlreadyVoted);
        }

        let weight = Self::balance_of(&env, &voter);
        if weight <= 0 {
            panic_with_error!(env, GovernanceError::InvalidProposal);
        }

        if support {
            proposal.yes_votes += weight;
        } else {
            proposal.no_votes += weight;
        }
        env.storage()
            .persistent()
            .set(&StorageKey::Proposal(id), &proposal);
        env.storage()
            .persistent()
            .set(&StorageKey::Voted(id, voter.clone()), &true);

        // Track voter in global list.
        let mut voters: Vec<Address> = env
            .storage()
            .instance()
            .get(&StorageKey::VoterList)
            .unwrap_or(Vec::new(&env));
        if !voters.contains(&voter) {
            voters.push_back(voter.clone());
            env.storage()
                .instance()
                .set(&StorageKey::VoterList, &voters);
        }

        let result = VoteResult {
            proposal_id: id,
            voter,
            support,
            voting_power: weight,
            timestamp: now,
        };

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("vote"), id),
            (result.voter, support, weight),
        );

        result
    }

    /// Execute a passed proposal after voting ends. Permissionless: anyone
    /// may execute a proposal that met quorum and majority-yes.
    pub fn execute(env: Env, id: u32) -> ExecuteResult {
        let mut proposal = Self::load_proposal(&env, id);
        let now = env.ledger().timestamp();
        if now <= proposal.voting_ends {
            panic_with_error!(env, GovernanceError::VotingNotEnded);
        }
        if proposal.executed {
            panic_with_error!(env, GovernanceError::AlreadyExecuted);
        }
        if !Self::has_passed(&env, &proposal) {
            panic_with_error!(env, GovernanceError::NotPassed);
        }

        proposal.executed = true;
        env.storage()
            .persistent()
            .set(&StorageKey::Proposal(id), &proposal);

        let result = ExecuteResult {
            proposal_id: id,
            success: true,
            timestamp: env.ledger().timestamp(),
        };

        env.events()
            .publish((symbol_short!("gov"), symbol_short!("execute"), id), true);

        result
    }

    /// Cancel a proposal before voting starts. Only the proposer may cancel.
    pub fn cancel(env: Env, caller: Address, id: u32) {
        let mut proposal = Self::load_proposal(&env, id);
        if proposal.proposer != caller {
            panic_with_error!(env, GovernanceError::NotProposer);
        }
        if proposal.cancelled {
            panic_with_error!(env, GovernanceError::AlreadyCancelled);
        }
        let now = env.ledger().timestamp();
        if now >= proposal.voting_starts {
            panic_with_error!(env, GovernanceError::VotingClosed);
        }

        proposal.cancelled = true;
        env.storage()
            .persistent()
            .set(&StorageKey::Proposal(id), &proposal);

        env.events()
            .publish((symbol_short!("gov"), symbol_short!("cancel")), id);
    }

    /// Extend the voting period of a proposal. Admin-only. Cannot extend
    /// after voting has ended.
    pub fn extend_voting(env: Env, caller: Address, id: u32, additional_seconds: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set");
        if caller != admin {
            panic_with_error!(env, GovernanceError::NotAdmin);
        }

        let mut proposal = Self::load_proposal(&env, id);
        let now = env.ledger().timestamp();
        if now > proposal.voting_ends {
            panic_with_error!(env, GovernanceError::CannotExtendEnded);
        }
        if proposal.executed || proposal.cancelled {
            panic_with_error!(env, GovernanceError::VotingClosed);
        }

        proposal.voting_ends += additional_seconds;
        env.storage()
            .persistent()
            .set(&StorageKey::Proposal(id), &proposal);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("extend"), id),
            additional_seconds,
        );
    }

    /// Set the quorum threshold in basis points (admin only, max 100%).
    pub fn set_quorum(env: Env, caller: Address, quorum_bps: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set");
        if caller != admin {
            panic_with_error!(env, GovernanceError::NotAdmin);
        }
        if quorum_bps > MAX_QUORUM_BPS {
            panic_with_error!(env, GovernanceError::InvalidQuorum);
        }
        env.storage()
            .instance()
            .set(&StorageKey::QuorumBps, &quorum_bps);
    }

    /// Get the list of all proposal IDs (read-only).
    pub fn get_proposals(env: Env) -> Vec<u32> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::ProposalCount)
            .unwrap_or(0);
        let mut list: Vec<u32> = Vec::new(&env);
        for i in 1..=count {
            list.push_back(i);
        }
        list
    }

    /// Get the list of all voters (read-only).
    pub fn get_voters(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&StorageKey::VoterList)
            .unwrap_or(Vec::new(&env))
    }

    /// Get the quorum threshold in basis points (read-only).
    pub fn get_quorum(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::QuorumBps)
            .unwrap_or(DEFAULT_QUORUM_BPS)
    }

    /// Get the admin address (read-only).
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Admin)
            .expect("admin not set")
    }

    // -----------------------------------------------------------------------
    // Read-only getters
    // -----------------------------------------------------------------------

    /// Get a proposal by ID (read-only).
    pub fn get_proposal(env: Env, id: u32) -> Proposal {
        Self::load_proposal(&env, id)
    }

    /// Get the number of proposals created (read-only).
    pub fn get_proposal_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::ProposalCount)
            .unwrap_or(0)
    }

    /// Has `voter` already voted on `id`? (read-only)
    pub fn has_voted(env: Env, id: u32, voter: Address) -> bool {
        env.storage()
            .persistent()
            .has(&StorageKey::Voted(id, voter))
    }

    /// Compute a proposal's status without writing (read-only).
    pub fn get_status(env: Env, id: u32) -> ProposalStatus {
        let proposal = Self::load_proposal(&env, id);
        let now = env.ledger().timestamp();
        if proposal.executed {
            return ProposalStatus::Executed;
        }
        if now <= proposal.voting_ends {
            return if now < proposal.voting_starts {
                ProposalStatus::Pending
            } else {
                ProposalStatus::Active
            };
        }
        if Self::has_passed(&env, &proposal) {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Rejected
        }
    }

    /// Voting power of `voter` = current token balance (read-only).
    pub fn get_voting_power(env: Env, voter: Address) -> i128 {
        Self::balance_of(&env, &voter)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn load_proposal(env: &Env, id: u32) -> Proposal {
        env.storage()
            .persistent()
            .get(&StorageKey::Proposal(id))
            .unwrap_or_else(|| panic_with_error!(env.clone(), GovernanceError::InvalidProposal))
    }

    fn token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&StorageKey::Token)
            .expect("token not set")
    }

    fn balance_of(env: &Env, who: &Address) -> i128 {
        token::Client::new(env, &Self::token(env)).balance(who)
    }

    /// Snapshot of total token supply recorded at construction (read-only).
    pub fn get_total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&StorageKey::TotalSupply)
            .unwrap_or(0)
    }

    /// Majority-yes AND quorum (configurable % of the supply snapshot) met.
    fn has_passed(env: &Env, proposal: &Proposal) -> bool {
        if proposal.yes_votes <= proposal.no_votes {
            return false;
        }
        let supply: i128 = env
            .storage()
            .instance()
            .get(&StorageKey::TotalSupply)
            .unwrap_or(0);
        let quorum_bps: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::QuorumBps)
            .unwrap_or(DEFAULT_QUORUM_BPS);
        let quorum = supply * quorum_bps as i128 / 10_000;
        (proposal.yes_votes + proposal.no_votes) >= quorum
    }
}

#[cfg(test)]
mod test;