//! Common token-related types and utilities for RemitX contracts

use soroban_sdk::{contracttype, Address, Env, Symbol};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum TokenSymbol {
    NGN,
    PHP,
    GBP,
    USD,
    XLM,
}

impl TokenSymbol {
    pub fn as_str(&self) -> &'static str {
        match self {
            TokenSymbol::NGN => "NGN",
            TokenSymbol::PHP => "PHP",
            TokenSymbol::GBP => "GBP",
            TokenSymbol::USD => "USD",
            TokenSymbol::XLM => "XLM",
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CurrencyInfo {
    pub symbol: Symbol,
    pub issuer: Address,
    pub name: Symbol,
    pub decimals: u32,
}

impl CurrencyInfo {
    pub fn ngn(env: &Env, issuer: Address) -> Self {
        CurrencyInfo {
            symbol: Symbol::new(env, "NGN"),
            issuer,
            name: Symbol::new(env, "Nigerian Naira"),
            decimals: 7,
        }
    }

    pub fn php(env: &Env, issuer: Address) -> Self {
        CurrencyInfo {
            symbol: Symbol::new(env, "PHP"),
            issuer,
            name: Symbol::new(env, "Philippine Peso"),
            decimals: 7,
        }
    }

    pub fn gbp(env: &Env, issuer: Address) -> Self {
        CurrencyInfo {
            symbol: Symbol::new(env, "GBP"),
            issuer,
            name: Symbol::new(env, "British Pound"),
            decimals: 7,
        }
    }

    pub fn usd(env: &Env, issuer: Address) -> Self {
        CurrencyInfo {
            symbol: Symbol::new(env, "USD"),
            issuer,
            name: Symbol::new(env, "US Dollar"),
            decimals: 7,
        }
    }

    pub fn xlm(env: &Env, issuer: Address) -> Self {
        CurrencyInfo {
            symbol: Symbol::new(env, "XLM"),
            issuer,
            name: Symbol::new(env, "Stellar Lumens"),
            decimals: 7,
        }
    }
}
