//! Exchange rate engine with TTL caching and fallback.
//!
//! Ported from `src/lib/rates.ts`. Provides an in-memory rate cache with
//! configurable TTL, a `convert` helper that fetches on miss/expiry, and a
//! pluggable fetch function so tests and the host app can inject their own
//! provider (e.g. CoinGecko, Stellar DEX, or a mock).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// Error type for rate operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RateError {
    PairNotSupported,
    FetchFailed(String),
    InvalidAmount,
}

/// A single cached exchange-rate entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RateEntry {
    pub from: String,
    pub to: String,
    pub rate: f64,
    pub fetched_at: u64,
    pub ttl_seconds: u64,
}

impl RateEntry {
    /// Returns true if the entry is older than its TTL.
    pub fn is_expired(&self, now: u64) -> bool {
        now.saturating_sub(self.fetched_at) >= self.ttl_seconds
    }
}

/// Current Unix time in seconds.
pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// In-memory exchange-rate cache keyed by "FROM:TO".
pub struct RateCache {
    rates: HashMap<String, RateEntry>,
}

impl Default for RateCache {
    fn default() -> Self {
        Self::new()
    }
}

impl RateCache {
    pub fn new() -> Self {
        Self {
            rates: HashMap::new(),
        }
    }

    /// Look up a cached rate. Returns `None` if missing or expired.
    pub fn get(&self, from: &str, to: &str, now: u64) -> Option<f64> {
        let key = format!("{}:{}", from, to);
        self.rates.get(&key).and_then(|e| {
            if e.is_expired(now) {
                None
            } else {
                Some(e.rate)
            }
        })
    }

    /// Insert or overwrite a cached rate.
    pub fn set(&mut self, from: &str, to: &str, rate: f64, ttl_seconds: u64) {
        let key = format!("{}:{}", from, to);
        let entry = RateEntry {
            from: from.to_string(),
            to: to.to_string(),
            rate,
            fetched_at: now_seconds(),
            ttl_seconds,
        };
        self.rates.insert(key, entry);
    }

    /// Remove a cached entry.
    pub fn remove(&mut self, from: &str, to: &str) {
        let key = format!("{}:{}", from, to);
        self.rates.remove(&key);
    }

    /// Number of entries currently cached.
    pub fn len(&self) -> usize {
        self.rates.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rates.is_empty()
    }
}

/// Convert `amount` from `from` asset to `to` asset.
///
/// Looks up the cache first; on miss or expiry calls `fetch` to refresh.
/// `fetch` receives `(from, to)` and should return the rate (1 `from` = X
/// `to`). The converted amount is rounded to 7 decimal places (stellar
/// compatible).
pub fn convert<F>(
    amount: f64,
    from: &str,
    to: &str,
    cache: &mut RateCache,
    fetch: F,
) -> Result<f64, RateError>
where
    F: Fn(&str, &str) -> Result<f64, RateError>,
{
    if amount < 0.0 || !amount.is_finite() {
        return Err(RateError::InvalidAmount);
    }
    let now = now_seconds();
    let rate = match cache.get(from, to, now) {
        Some(r) => r,
        None => {
            let r = fetch(from, to)?;
            cache.set(from, to, r, 60);
            r
        }
    };
    Ok((amount * rate * 1e7).round() / 1e7)
}

/// Default fetch function used when no provider is injected. Returns an
/// error — callers should always inject a real fetch function.
pub fn default_fetch(_from: &str, _to: &str) -> Result<f64, RateError> {
    Err(RateError::PairNotSupported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_fetch(_from: &str, _to: &str) -> Result<f64, RateError> {
        // 1 USDC = 1500 NGN, 1 USDC = 0.92 EUR
        match (_from, _to) {
            ("USDC", "NGN") => Ok(1500.0),
            ("NGN", "USDC") => Ok(1.0 / 1500.0),
            ("USDC", "EUR") => Ok(0.92),
            ("EUR", "USDC") => Ok(1.0 / 0.92),
            _ => Err(RateError::PairNotSupported),
        }
    }

    #[test]
    fn convert_uses_cached_rate_without_fetching() {
        let mut cache = RateCache::new();
        cache.set("USDC", "NGN", 1500.0, 3600);
        let result = convert(100.0, "USDC", "NGN", &mut cache, |_, _| {
            panic!("fetch should not be called when cache is valid")
        });
        assert!((result.unwrap() - 150000.0).abs() < f64::EPSILON);
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn convert_fetches_on_cache_miss() {
        let mut cache = RateCache::new();
        assert!(cache.is_empty());
        let result = convert(10.0, "USDC", "NGN", &mut cache, mock_fetch);
        assert!((result.unwrap() - 15000.0).abs() < f64::EPSILON);
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn convert_fetches_on_expired_cache() {
        let mut cache = RateCache::new();
        cache.set("USDC", "NGN", 100.0, 0); // TTL 0 -> immediately expired
        let result = convert(10.0, "USDC", "NGN", &mut cache, mock_fetch);
        assert!((result.unwrap() - 15000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn convert_rounds_to_stellar_precision() {
        let mut cache = RateCache::new();
        cache.set("USDC", "EUR", 0.923456789, 3600);
        let result = convert(1.0, "USDC", "EUR", &mut cache, |_, _| unreachable!());
        assert!((result.unwrap() - 0.9234568).abs() < 1e-8);
    }

    #[test]
    fn convert_rejects_negative_amount() {
        let mut cache = RateCache::new();
        let result = convert(-10.0, "USDC", "NGN", &mut cache, mock_fetch);
        assert_eq!(result, Err(RateError::InvalidAmount));
    }

    #[test]
    fn convert_rejects_non_finite_amount() {
        let mut cache = RateCache::new();
        let result = convert(f64::INFINITY, "USDC", "NGN", &mut cache, mock_fetch);
        assert_eq!(result, Err(RateError::InvalidAmount));
    }

    #[test]
    fn convert_unsupported_pair_returns_error() {
        let mut cache = RateCache::new();
        let result = convert(10.0, "XYZ", "ABC", &mut cache, mock_fetch);
        assert_eq!(result, Err(RateError::PairNotSupported));
    }

    #[test]
    fn cache_entry_expiry() {
        let entry = RateEntry {
            from: "USDC".to_string(),
            to: "NGN".to_string(),
            rate: 1500.0,
            fetched_at: 100,
            ttl_seconds: 60,
        };
        assert!(!entry.is_expired(150));
        assert!(entry.is_expired(160));
        // Exactly at fetched_at -> not yet expired (0 < ttl).
        assert!(!entry.is_expired(100));
    }

    #[test]
    fn now_seconds_is_nonzero() {
        assert!(now_seconds() > 1_700_000_000);
    }
}
