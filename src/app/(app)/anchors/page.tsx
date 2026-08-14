"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  ChevronRight,
  ListFilter,
  Download,
  BadgeCheck,
} from "lucide-react";

interface AnchorRow {
  id: string;
  name: string;
  domain: string;
  corridor: string;
  country: string;
  countryFlag: string;
  assetCode: string;
  feePercent: number;
  typicalSettlement: string;
  estimatedFee: number;
}

const COUNTRIES = ["All", "Nigeria", "Philippines", "Mexico", "Argentina", "European Union"];
const ASSETS = ["USDC", "EURC", "XLM"];

export default function AnchorsPage() {
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("All");
  const [assetCode, setAssetCode] = useState("USDC");
  const [amount, setAmount] = useState("1000");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ assetCode, amount });
      if (country !== "All") params.set("corridor", country);
      const res = await fetch(`/api/anchors?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setAnchors(json.data.anchors);
      } else {
        setError(json.error || "Couldn't load anchors.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [country, assetCode, amount]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      await load();
      if (ignore) return;
    })();
    return () => {
      ignore = true;
    };
  }, [load]);

  const exportCsv = () => {
    const header = "Name,Domain,Corridor,Asset,Fee %,Est. Fee,Settlement\n";
    const rows = anchors
      .map((a) => `${a.name},${a.domain},${a.corridor},${a.assetCode},${a.feePercent},${a.estimatedFee},${a.typicalSettlement}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "remitx-anchors.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
          <div>
            <nav className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 mb-1.5">
              <span>Network</span>
              <ChevronRight size={12} />
              <span className="text-primary">Anchor Comparison</span>
            </nav>
            <h2 className="text-xl lg:text-2xl font-bold text-primary">Anchor Fee Comparison</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Curated SEP-24 anchor directory — fees updated as we onboard and audit anchors.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={anchors.length === 0}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={load}
              className="px-3 py-1.5 bg-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Update
            </button>
          </div>
        </div>

        {/* Filters */}
        <section className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center gap-3 border border-gray-200">
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary mr-1">
            <ListFilter size={14} />Filter:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COUNTRIES.map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all active:scale-95 ${
                  country === c ? "bg-primary text-white" : "border border-gray-200 text-gray-500 hover:border-primary hover:text-primary"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <select
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              className="bg-gray-50 border-none rounded-lg text-xs font-semibold py-1.5 pl-2 pr-6 focus:ring-1 focus:ring-primary"
            >
              {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-gray-50 border-none rounded-lg text-xs font-semibold py-1.5 pl-2 pr-6 focus:ring-1 focus:ring-primary"
            >
              <option value="1000">$1,000</option>
              <option value="5000">$5,000</option>
              <option value="10000">$10,000</option>
            </select>
          </div>
        </section>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-primary text-white">
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider">Anchor</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider hidden sm:table-cell">Corridor</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-right">Fee</th>
                  <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-right hidden md:table-cell">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Loading anchors…</td></tr>
                ) : anchors.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">No anchors match these filters.</td></tr>
                ) : (
                  anchors.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-all duration-200">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-primary">
                            {a.name.charAt(0)}
                          </div>
                          <div><p className="text-sm font-semibold text-gray-800">{a.name}</p><p className="text-[10px] text-gray-400">{a.domain}</p></div>
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5"><span className="text-base">{a.countryFlag}</span><span className="text-xs font-semibold text-gray-600">{a.corridor}</span></div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <p className="text-sm font-bold text-secondary">{a.feePercent}%</p>
                        <p className="text-[9px] text-gray-400 font-semibold uppercase">Est: ${a.estimatedFee.toFixed(2)}</p>
                      </td>
                      <td className="py-3 px-4 text-right hidden md:table-cell">
                        <p className="text-xs font-semibold text-gray-600">{a.typicalSettlement}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400">{anchors.length} anchor{anchors.length === 1 ? "" : "s"} match these filters</p>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <BadgeCheck size={12} /> Curated directory, manually verified
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
