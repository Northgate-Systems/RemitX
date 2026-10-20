//! Curated anchor directory for RemitX.
//!
//! Ported from `src/lib/anchors.ts`. There's no single live registry of
//! SEP-24 anchor fees across corridors — every remittance product that shows
//! this kind of comparison maintains its own directory and updates it as it
//! onboards/audits anchors. This file is that directory. Treat it like
//! content, not a stub: add a real anchor once you've verified its fee
//! schedule and SEP-24 support, and this powers the /anchors page and the
//! /api/anchors endpoint for real.

use serde::Serialize;

/// A SEP-24 anchor (on/off-ramp) that RemitX can route through.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Anchor {
    pub id: &'static str,
    pub name: &'static str,
    pub domain: &'static str,
    pub corridor: &'static str,
    pub country: &'static str,
    pub country_flag: &'static str,
    pub asset_code: &'static str,
    pub fee_percent: f64,
    pub typical_settlement: &'static str,
    pub sep24: bool,
    pub home_domain: &'static str,
}

/// Filters for [`list_anchors`].
#[derive(Debug, Default, Clone)]
pub struct AnchorFilters {
    pub corridor: Option<String>,
    pub asset_code: Option<String>,
}

/// Curated anchor directory. Verified against each anchor's published fee
/// schedule and SEP-24 support as of the last audit.
pub const ANCHORS: [Anchor; 4] = [
    Anchor {
        id: "vibrant",
        name: "Vibrant Finance",
        domain: "vibrant.io",
        corridor: "MXN (Mexico)",
        country: "Mexico",
        country_flag: "🇲🇽",
        asset_code: "USDC",
        fee_percent: 0.5,
        typical_settlement: "Instant",
        sep24: true,
        home_domain: "vibrant.io",
    },
    Anchor {
        id: "cowrie",
        name: "Cowrie Integrated Services",
        domain: "cowrie.exchange",
        corridor: "NGN (Nigeria)",
        country: "Nigeria",
        country_flag: "🇳🇬",
        asset_code: "USDC",
        fee_percent: 0.75,
        typical_settlement: "~15 min",
        sep24: true,
        home_domain: "cowrie.exchange",
    },
    Anchor {
        id: "anclap",
        name: "Anclap",
        domain: "anclap.com",
        corridor: "ARS (Argentina)",
        country: "Argentina",
        country_flag: "🇦🇷",
        asset_code: "USDC",
        fee_percent: 1.2,
        typical_settlement: "1-2 hrs",
        sep24: true,
        home_domain: "anclap.com",
    },
    Anchor {
        id: "tempo",
        name: "Tempo EU",
        domain: "tempo.eu.com",
        corridor: "EUR (Europe)",
        country: "European Union",
        country_flag: "🇪🇺",
        asset_code: "EURC",
        fee_percent: 0.35,
        typical_settlement: "SEPA: 1 day",
        sep24: true,
        home_domain: "tempo.eu.com",
    },
];

/// List anchors matching the optional filters, sorted by fee ascending
/// (cheapest first).
pub fn list_anchors(filters: AnchorFilters) -> Vec<Anchor> {
    let mut result: Vec<Anchor> = ANCHORS
        .iter()
        .filter(|a| {
        if let Some(corridor) = filters.corridor.as_deref() {
            if corridor != "All"
                && !a.country.to_lowercase().contains(&corridor.to_lowercase())
            {
                return false;
            }
        }
        if let Some(asset_code) = filters.asset_code.as_deref() {
            if a.asset_code != asset_code {
                return false;
            }
        }
        true
    })
        .cloned()
        .collect();
    result.sort_by(|a, b| a.fee_percent.partial_cmp(&b.fee_percent).unwrap());
    result
}

/// Estimate the fee for a given anchor and send amount, rounded to 2
/// decimals.
pub fn estimate_fee(anchor: &Anchor, amount: f64) -> f64 {
    (amount * (anchor.fee_percent / 100.0) * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_all_anchors_returns_all_four() {
        let anchors = list_anchors(AnchorFilters::default());
        assert_eq!(anchors.len(), 4);
    }

    #[test]
    fn list_anchors_sorted_by_fee_ascending() {
        let anchors = list_anchors(AnchorFilters::default());
        // Cheapest first: Tempo (0.35), Vibrant (0.5), Cowrie (0.75), Anclap (1.2)
        assert_eq!(anchors[0].id, "tempo");
        assert_eq!(anchors[1].id, "vibrant");
        assert_eq!(anchors[2].id, "cowrie");
        assert_eq!(anchors[3].id, "anclap");
        let fees: Vec<f64> = anchors.iter().map(|a| a.fee_percent).collect();
        assert!(fees.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn filter_by_corridor_country() {
        let anchors = list_anchors(AnchorFilters {
            corridor: Some("Nigeria".to_string()),
            asset_code: None,
        });
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].id, "cowrie");
    }

    #[test]
    fn filter_by_asset_code() {
        let anchors = list_anchors(AnchorFilters {
            corridor: None,
            asset_code: Some("EURC".to_string()),
        });
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].id, "tempo");
    }

    #[test]
    fn filter_by_both() {
        let anchors = list_anchors(AnchorFilters {
            corridor: Some("Mexico".to_string()),
            asset_code: Some("USDC".to_string()),
        });
        assert_eq!(anchors.len(), 1);
        assert_eq!(anchors[0].id, "vibrant");
    }

    #[test]
    fn filter_matches_no_anchors() {
        let anchors = list_anchors(AnchorFilters {
            corridor: Some("Nowhere".to_string()),
            asset_code: None,
        });
        assert!(anchors.is_empty());
    }

    #[test]
    fn estimate_fee_rounds_to_two_decimals() {
        let vibrant = ANCHORS.iter().find(|a| a.id == "vibrant").unwrap();
        assert!((estimate_fee(vibrant, 100.0) - 0.50).abs() < f64::EPSILON);
        assert!((estimate_fee(vibrant, 33.333) - 0.17).abs() < f64::EPSILON);
        assert!((estimate_fee(vibrant, 0.0) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn estimate_fee_matches_typescript_original() {
        // Port fidelity check against the TS reference:
        // Math.round(amount * (feePercent / 100) * 100) / 100
        let anclap = ANCHORS.iter().find(|a| a.id == "anclap").unwrap();
        assert!((estimate_fee(anclap, 1000.0) - 12.00).abs() < f64::EPSILON);
        assert!((estimate_fee(anclap, 250.50) - 3.01).abs() < f64::EPSILON);
    }
}
