/**
 * Curated anchor directory for RemitX.
 *
 * There's no single live registry of SEP-24 anchor fees across corridors -
 * every remittance product that shows this kind of comparison maintains its
 * own directory and updates it as it onboards/audits anchors. This file is
 * that directory. Treat it like content, not a stub: add a real anchor here
 * once you've verified its fee schedule and SEP-24 support, and this powers
 * the /anchors page and the /api/anchors endpoint for real.
 */

export interface Anchor {
  id: string;
  name: string;
  domain: string;
  corridor: string;
  country: string;
  countryFlag: string;
  assetCode: string;
  feePercent: number;
  typicalSettlement: string;
  sep24: boolean;
  homeDomain: string; // used to fetch the anchor's stellar.toml, e.g. for TRANSFER_SERVER_SEP0024
}

export const ANCHORS: Anchor[] = [
  {
    id: "vibrant",
    name: "Vibrant Finance",
    domain: "vibrant.io",
    corridor: "MXN (Mexico)",
    country: "Mexico",
    countryFlag: "🇲🇽",
    assetCode: "USDC",
    feePercent: 0.5,
    typicalSettlement: "Instant",
    sep24: true,
    homeDomain: "vibrant.io",
  },
  {
    id: "cowrie",
    name: "Cowrie Integrated Services",
    domain: "cowrie.exchange",
    corridor: "NGN (Nigeria)",
    country: "Nigeria",
    countryFlag: "🇳🇬",
    assetCode: "USDC",
    feePercent: 0.75,
    typicalSettlement: "~15 min",
    sep24: true,
    homeDomain: "cowrie.exchange",
  },
  {
    id: "anclap",
    name: "Anclap",
    domain: "anclap.com",
    corridor: "ARS (Argentina)",
    country: "Argentina",
    countryFlag: "🇦🇷",
    assetCode: "USDC",
    feePercent: 1.2,
    typicalSettlement: "1-2 hrs",
    sep24: true,
    homeDomain: "anclap.com",
  },
  {
    id: "tempo",
    name: "Tempo EU",
    domain: "tempo.eu.com",
    corridor: "EUR (Europe)",
    country: "European Union",
    countryFlag: "🇪🇺",
    assetCode: "EURC",
    feePercent: 0.35,
    typicalSettlement: "SEPA: 1 day",
    sep24: true,
    homeDomain: "tempo.eu.com",
  },
];

export function listAnchors(filters: { corridor?: string; assetCode?: string } = {}): Anchor[] {
  return ANCHORS.filter((a) => {
    if (filters.corridor && filters.corridor !== "All" && !a.country.toLowerCase().includes(filters.corridor.toLowerCase())) {
      return false;
    }
    if (filters.assetCode && a.assetCode !== filters.assetCode) {
      return false;
    }
    return true;
  }).sort((a, b) => a.feePercent - b.feePercent);
}

export function estimateFee(anchor: Anchor, amount: number): number {
  return Math.round(amount * (anchor.feePercent / 100) * 100) / 100;
}
