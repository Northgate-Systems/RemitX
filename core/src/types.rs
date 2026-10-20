//! Shared domain types.
//!
//! Ported from `src/lib/types.ts`. These mirror the Supabase schema
//! (see `supabase-schema.sql`) and are used by both the Rust core and (via
//! WASM/serde JSON) the TypeScript frontend. If you add/change a column,
//! update both the SQL and this file.

use serde::{Deserialize, Serialize};

/// KYC lifecycle states for a user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KycStatus {
    Pending,
    Verified,
    Rejected,
}

/// Lifecycle of a remittance transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionStatus {
    Pending,
    Validating,
    Confirmed,
    Failed,
}

/// Escrow (locked-funds) states used by the Soroban escrow contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
    Expired,
}

/// A registered user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub password_hash: String,
    pub stellar_public_key: Option<String>,
    pub kyc_status: KycStatus,
    pub session_version: i32,
    pub failed_login_attempts: i32,
    pub locked_until: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A remittance transaction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub user_id: String,
    pub from_asset: String,
    pub to_asset: String,
    pub from_amount: String,
    pub to_amount: Option<String>,
    pub recipient_address: String,
    pub stellar_tx_hash: Option<String>,
    pub escrow_id: Option<String>,
    pub status: TransactionStatus,
    pub created_at: String,
    pub confirmed_at: Option<String>,
    pub updated_at: String,
}

/// An escrow record linking a transaction to a Soroban contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Escrow {
    pub id: String,
    pub user_id: String,
    pub transaction_id: String,
    pub contract_address: String,
    pub sender_address: String,
    pub recipient_address: String,
    pub amount: String,
    pub asset: String,
    pub status: EscrowStatus,
    pub deposit_tx_hash: Option<String>,
    pub release_tx_hash: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    pub updated_at: String,
}

/// A cached exchange rate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rate {
    pub id: String,
    pub from_asset: String,
    pub to_asset: String,
    pub rate: String,
    pub fetched_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kyc_status_roundtrips_via_json() {
        let status = KycStatus::Verified;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"verified\"");
        let back: KycStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, KycStatus::Verified);
    }

    #[test]
    fn transaction_status_roundtrips_via_json() {
        let cases = [
            (TransactionStatus::Pending, "pending"),
            (TransactionStatus::Validating, "validating"),
            (TransactionStatus::Confirmed, "confirmed"),
            (TransactionStatus::Failed, "failed"),
        ];
        for (status, expected) in cases {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
            let back: TransactionStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(back, status);
        }
    }

    #[test]
    fn escrow_status_roundtrips_via_json() {
        let cases = [
            (EscrowStatus::Locked, "locked"),
            (EscrowStatus::Released, "released"),
            (EscrowStatus::Refunded, "refunded"),
            (EscrowStatus::Expired, "expired"),
        ];
        for (status, expected) in cases {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
            let back: EscrowStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(back, status);
        }
    }

    #[test]
    fn user_serializes_with_snake_case_fields() {
        let user = User {
            id: "u1".to_string(),
            email: "alice@example.com".to_string(),
            first_name: "Alice".to_string(),
            last_name: "Smith".to_string(),
            password_hash: "hash".to_string(),
            stellar_public_key: Some(
                "GBRPYHIL2C3T2DTB24CVN2F4Q3S5P7JQZ6WFHVN3J2X2X2X2X2X2X2X".to_string(),
            ),
            kyc_status: KycStatus::Pending,
            session_version: 1,
            failed_login_attempts: 0,
            locked_until: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&user).unwrap();
        assert!(json.contains("\"first_name\""));
        assert!(json.contains("\"password_hash\""));
        assert!(json.contains("\"stellar_public_key\""));
        assert!(json.contains("\"session_version\""));
        assert!(json.contains("\"failed_login_attempts\""));
        assert!(json.contains("\"locked_until\""));
        assert!(json.contains("\"created_at\""));
        assert!(json.contains("\"updated_at\""));
        let back: User = serde_json::from_str(&json).unwrap();
        assert_eq!(back, user);
    }

    #[test]
    fn transaction_with_none_fields_serializes_correctly() {
        let tx = Transaction {
            id: "t1".to_string(),
            user_id: "u1".to_string(),
            from_asset: "USDC".to_string(),
            to_asset: "NGN".to_string(),
            from_amount: "100.00".to_string(),
            to_amount: None,
            recipient_address:
                "GBRPYHIL2C3T2DTB24CVN2F4Q3S5P7JQZ6WFHVN3J2X2X2X2X2X2X2X".to_string(),
            stellar_tx_hash: None,
            escrow_id: None,
            status: TransactionStatus::Pending,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            confirmed_at: None,
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&tx).unwrap();
        let back: Transaction = serde_json::from_str(&json).unwrap();
        assert_eq!(back, tx);
    }
}
