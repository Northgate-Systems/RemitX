//! Common types shared across RemitX contracts

use soroban_sdk::{Address, BytesN, String, Symbol, Vec};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum ContractKind {
    Escrow,
    Exchange,
    Staking,
    Governance,
}

impl ContractKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ContractKind::Escrow => "escrow",
            ContractKind::Exchange => "exchange",
            ContractKind::Staking => "staking",
            ContractKind::Governance => "governance",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum ActionType {
    Deposit,
    Release,
    Refund,
    Exchange,
    Stake,
    Unstake,
    Vote,
    VoteCast,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum AssetType {
    Token,
    StellarXlm,
    Anchor,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct Route {
    pub from_asset: Address,
    pub to_asset: Address,
    pub path: Vec<Address>,
    pub rate: i128, // fixed-point price (scaled; f64 is not a valid host type)
    pub fee: i128,
    pub estimated_time: u64,
    pub source: Symbol,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct ExchangePair {
    pub base: Address,
    pub quote: Address,
    pub reserve_base: i128,
    pub reserve_quote: i128,
    pub last_update: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum StakingStatus {
    Active,
    Unstaking,
    Expired,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct StakeRecord {
    pub staker: Address,
    pub amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub status: StakingStatus,
    pub rewards: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum GovernanceVoteStatus {
    Pending,
    Active,
    Completed,
    Failed,
    Passed,
}

#[derive(Clone, Debug)]
#[soroban_sdk::contracttype]
pub struct GovernanceProposal {
    pub proposal_id: BytesN<32>,
    pub creator: Address,
    pub description: String,
    pub type_: String,
    pub vote_options: Vec<String>,
    pub end_time: u64,
    pub vote_threshold: u32,
    pub quorum: u32,
    pub status: GovernanceVoteStatus,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum DaoAction {
    CreateProposal,
    Vote,
    Execute,
    EmergencyPause,
    AdminConfig,
}

impl ActionType {
    pub fn from_str(s: &str) -> Option<ActionType> {
        match s {
            "deposit" => Some(ActionType::Deposit),
            "release" => Some(ActionType::Release),
            "refund" => Some(ActionType::Refund),
            "exchange" => Some(ActionType::Exchange),
            "stake" => Some(ActionType::Stake),
            "unstake" => Some(ActionType::Unstake),
            "vote" => Some(ActionType::Vote),
            "vote_cast" => Some(ActionType::VoteCast),
            _ => None,
        }
    }
}
