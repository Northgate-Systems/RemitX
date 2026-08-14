"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { BellPlus, Pencil, Trash2, CheckCircle2, X, ArrowUp, ArrowDown } from "lucide-react";

interface RateData {
  rate: string;
  fromAsset: string;
  toAsset: string;
  fetchedAt: string;
  source: string;
}

interface RateHistoryPoint {
  rate: number;
  at: number;
}

const ASSET_PAIRS = [
  { from: "USDC", to: "NGN", label: "USDC/NGN" },
  { from: "XLM", to: "USDC", label: "XLM/USDC" },
  { from: "EURC", to: "USDC", label: "EURC/USDC" },
  { from: "USD", to: "EUR", label: "USD/EUR" },
  { from: "USDC", to: "KES", label: "USDC/KES" },
  { from: "USDC", to: "GHS", label: "USDC/GHS" },
];

const POLL_MS = 12_000; // real-time-feeling refresh without hammering the free rate API (5-min server cache absorbs the rest)
const HISTORY_LIMIT = 30; // rolling window of actually-observed rates since this page opened

export default function RatesPage() {
  const [activePair, setActivePair] = useState("USDC/NGN");
  const [rates, setRates] = useState<Record<string, RateData>>({});
  const [prevRates, setPrevRates] = useState<Record<string, number>>({});
  const [flashPair, setFlashPair] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, RateHistoryPoint[]>>({});
  const [liquidity, setLiquidity] = useState<{ reserves: { asset: string; amount: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ratesRef = useRef(rates);
  useEffect(() => {
    ratesRef.current = rates;
  }, [rates]);

  const fetchAllRates = useCallback(async () => {
    setError(null);
    const results: Record<string, RateData> = {};
    let anySuccess = false;

    for (const pair of ASSET_PAIRS) {
      try {
        const res = await fetch(`/api/stellar/rate?from=${pair.from}&to=${pair.to}`);
        const json = await res.json();
        if (json.success) {
          results[pair.label] = json.data;
          anySuccess = true;
        }
      } catch {
        // Keep partial results
      }
    }

    if (!anySuccess) {
      setError("Couldn't reach the rate service. Showing the last known values, if any.");
    } else {
      // Track which pair actually moved since the last poll, for the flash + delta indicator
      const previous = ratesRef.current;
      let movedPair: string | null = null;
      const nextPrev: Record<string, number> = {};
      for (const [label, data] of Object.entries(results)) {
        const prior = previous[label];
        if (prior) {
          nextPrev[label] = parseFloat(prior.rate);
          if (prior.rate !== data.rate) movedPair = label;
        }
      }
      setPrevRates((p) => ({ ...p, ...nextPrev }));
      if (movedPair) {
        setFlashPair(movedPair);
        setTimeout(() => setFlashPair(null), 900);
      }

      setHistory((h) => {
        const next = { ...h };
        for (const [label, data] of Object.entries(results)) {
          const point: RateHistoryPoint = { rate: parseFloat(data.rate), at: Date.now() };
          const series = [...(next[label] || []), point].slice(-HISTORY_LIMIT);
          next[label] = series;
        }
        return next;
      });
    }

    setRates(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      await fetchAllRates();
      if (ignore) return;
    })();
    const interval = setInterval(fetchAllRates, POLL_MS);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [fetchAllRates]);

  // Real liquidity pool reserves for the active pair's base asset
  useEffect(() => {
    const base = activePair.split("/")[0];
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/stellar/liquidity?asset=${base}`);
        const json = await res.json();
        if (!ignore) setLiquidity(res.ok ? json.data.pool : null);
      } catch {
        if (!ignore) setLiquidity(null);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [activePair]);


  // Intersection observer for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-scale-cascade");
            entry.target.classList.remove("opacity-0");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    document
      .querySelectorAll(".animate-on-scroll")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rates]);

  const activeRate = rates[activePair];
  const activePairConfig = ASSET_PAIRS.find((p) => p.label === activePair);
  const priorRate = prevRates[activePair];
  const currentRateNum = activeRate ? parseFloat(activeRate.rate) : null;
  const pctChange =
    priorRate && currentRateNum !== null ? ((currentRateNum - priorRate) / priorRate) * 100 : null;
  const activeHistory = history[activePair] || [];

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 animate-slide-blur">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-800">
              Rates & DEX Monitor
            </h2>
            <p className="text-sm text-gray-500">
              Real-time Stellar DEX spreads and automated threshold alerts.
            </p>
          </div>
          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-lg overflow-x-auto">
            {ASSET_PAIRS.map((pair) => (
              <button
                key={pair.label}
                onClick={() => setActivePair(pair.label)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold whitespace-nowrap transition-all ${
                  activePair === pair.label
                    ? "bg-white shadow-sm text-primary"
                    : "text-gray-500 hover:bg-white"
                }`}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Chart + Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-gray-200 opacity-0 animate-on-scroll">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div>
                {loading && !activeRate ? (
                  <div className="animate-pulse">
                    <div className="h-7 w-32 bg-gray-200 rounded mb-1"></div>
                    <div className="h-3 w-40 bg-gray-200 rounded"></div>
                  </div>
                ) : activeRate ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xl font-bold transition-colors duration-500 ${
                          flashPair === activePair
                            ? pctChange !== null && pctChange > 0
                              ? "text-emerald-600"
                              : pctChange !== null && pctChange < 0
                              ? "text-red-600"
                              : "text-gray-800"
                            : "text-gray-800"
                        }`}
                      >
                        {parseFloat(activeRate.rate).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                      </span>
                      {pctChange !== null && Math.abs(pctChange) > 0.0001 && (
                        <span
                          className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            pctChange > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {pctChange > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                          {Math.abs(pctChange).toFixed(3)}%
                        </span>
                      )}
                      {activeRate.source === "fallback" && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                          stale
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">
                      Current {activeRate.fromAsset}/{activeRate.toAsset} Rate
                    </p>
                    <p className="text-[9px] text-gray-400 mt-1">
                      Updated{" "}
                      {new Date(activeRate.fetchedAt).toLocaleTimeString()}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-bold text-gray-400">
                        --
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">
                      {activePairConfig
                        ? `${activePairConfig.from}/${activePairConfig.to} rate unavailable`
                        : "Rate unavailable"}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    loading ? "bg-amber-400" : "bg-secondary"
                  }`}
                ></span>
                <span className="text-[10px] text-gray-400">
                  {loading ? "Loading..." : `Live, refreshing every ${POLL_MS / 1000}s`}
                </span>
              </div>
            </div>
            <div className="h-[180px] lg:h-[250px] w-full">
              {activeHistory.length < 2 ? (
                <div className="flex items-center justify-center h-full text-xs text-gray-400">
                  Watching for rate changes - chart fills in as updates come in.
                </div>
              ) : (
                (() => {
                  const values = activeHistory.map((p) => p.rate);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min || 1;
                  const width = 800;
                  const height = 200;
                  const step = width / (activeHistory.length - 1);
                  const points = activeHistory.map((p, i) => {
                    const x = i * step;
                    const y = height - ((p.rate - min) / range) * (height - 20) - 10;
                    return `${x},${y}`;
                  });
                  const linePath = `M${points.join(" L")}`;
                  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
                  return (
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
                      <defs>
                        <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#006b5c" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#006b5c" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#cg)" />
                      <path d={linePath} fill="none" stroke="#006b5c" strokeLinecap="round" strokeWidth="2.5" />
                    </svg>
                  );
                })()
              )}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-gray-400">
              {activeHistory.length >= 2 ? (
                <>
                  <span>{new Date(activeHistory[0].at).toLocaleTimeString()}</span>
                  <span>Now</span>
                </>
              ) : (
                <span>Live rates observed since you opened this page</span>
              )}
            </div>
          </div>
          <div
            className="space-y-4 opacity-0 animate-on-scroll"
            style={{ animationDelay: "100ms" }}
          >
            <div className="bg-primary text-white rounded-xl p-5 shadow-md relative overflow-hidden flex flex-col justify-between h-full">
              <div className="relative z-10">
                <h3 className="text-[10px] uppercase tracking-widest opacity-80 mb-1 font-bold">
                  On-Chain Liquidity ({activePairConfig?.from})
                </h3>
                <p className="text-lg font-bold">
                  {liquidity
                    ? `${parseFloat(liquidity.reserves[0]?.amount || "0").toLocaleString(undefined, { maximumFractionDigits: 0 })} ${activePairConfig?.from}`
                    : "No pool found"}
                </p>
              </div>
              <div className="relative z-10 space-y-2.5 mt-4">
                {activeRate ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-70">Rate</span>
                      <span className="font-bold">
                        {parseFloat(activeRate.rate).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-70">Source</span>
                      <span className="font-bold capitalize">
                        {activeRate.source === "cache" ? "cached" : "live"}
                      </span>
                    </div>
                    {liquidity && (
                      <div className="flex justify-between text-xs">
                        <span className="opacity-70">Pool shares</span>
                        <span className="font-bold">{parseFloat(liquidity.reserves[1]?.amount || "0").toLocaleString(undefined, { maximumFractionDigits: 0 })} {liquidity.reserves[1]?.asset === "native" ? "XLM" : liquidity.reserves[1]?.asset?.split(":")[0]}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-70">Best Bid</span>
                      <span className="font-bold">--</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-70">Best Ask</span>
                      <span className="font-bold">--</span>
                    </div>
                  </>
                )}
              </div>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </section>

        {/* Create Alert Form */}
        <section
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden opacity-0 animate-on-scroll"
          style={{ animationDelay: "200ms" }}
        >
          <div className="p-4 lg:p-5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-800">
              Create New Rate Alert
            </h3>
          </div>
          <form
            className="p-4 lg:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const toast = document.getElementById("toast");
              if (toast) {
                toast.classList.remove("translate-y-20", "opacity-0");
                toast.classList.add("translate-y-0", "opacity-100");
                setTimeout(() => {
                  toast.classList.add("translate-y-20", "opacity-0");
                  toast.classList.remove("translate-y-0", "opacity-100");
                }, 5000);
              }
            }}
          >
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase">
                Asset Pair
              </label>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                {ASSET_PAIRS.map((pair) => (
                  <option key={pair.label}>{pair.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase">
                Condition
              </label>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                <option>Rises Above</option>
                <option>Drops Below</option>
                <option>Reaches Exactly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase">
                Threshold
              </label>
              <div className="relative">
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none pr-10"
                  placeholder="Enter threshold"
                  type="number"
                  step="any"
                />
                <span className="absolute right-3 top-2.5 text-[10px] text-gray-400 font-semibold">
                  {activePair.split("/")[1] || "NGN"}
                </span>
              </div>
            </div>
            <div>
              <button
                className="w-full bg-secondary text-white py-2.5 rounded-lg text-xs font-bold hover:opacity-95 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                type="submit"
              >
                <BellPlus size={14} />{" "}
                Set Alert
              </button>
            </div>
          </form>
        </section>

        {/* Active Alerts */}
        <section
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden opacity-0 animate-on-scroll"
          style={{ animationDelay: "300ms" }}
        >
          <div className="p-4 lg:p-5 flex justify-between items-center border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-800">
              Active Rate Monitors
            </h3>
            <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
              3 Active
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase font-bold">
                  <th className="px-4 lg:px-5 py-3">Pair</th>
                  <th className="px-4 lg:px-5 py-3 hidden sm:table-cell">
                    Condition
                  </th>
                  <th className="px-4 lg:px-5 py-3">Threshold</th>
                  <th className="px-4 lg:px-5 py-3 hidden md:table-cell">
                    Current
                  </th>
                  <th className="px-4 lg:px-5 py-3">Status</th>
                  <th className="px-4 lg:px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { p1: "USDC", p2: "NGN", cond: "Rises Above", th: "1,650.00", st: "Monitoring", sCls: "bg-emerald-50 text-emerald-700" },
                  { p1: "XLM", p2: "USDC", cond: "Drops Below", th: "0.1042", st: "Monitoring", sCls: "bg-emerald-50 text-emerald-700" },
                  { p1: "EURC", p2: "USDC", cond: "Reaches Exactly", th: "1.0900", st: "Near Hit", sCls: "bg-red-50 text-red-700" },
                ].map((a, i) => {
                  const label = `${a.p1}/${a.p2}`;
                  const live = rates[label];
                  const diff = live
                    ? (
                        (parseFloat(live.rate) -
                          parseFloat(a.th.replace(/,/g, ""))) /
                        parseFloat(a.th.replace(/,/g, "")) *
                        100
                      ).toFixed(2)
                    : null;

                  return (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 transition-all duration-200"
                    >
                      <td className="px-4 lg:px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex -space-x-1.5">
                            <div
                              className={`w-7 h-7 rounded-full ${
                                i === 0
                                  ? "bg-primary"
                                  : i === 1
                                  ? "bg-indigo-100 text-indigo-600"
                                  : "bg-blue-600"
                              } flex items-center justify-center text-[8px] text-white border-2 border-white`}
                            >
                              {a.p1}
                            </div>
                            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[8px] text-white border-2 border-white">
                              {a.p2}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-gray-700">
                            {label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 lg:px-5 py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {a.cond}
                      </td>
                      <td className="px-4 lg:px-5 py-3 text-xs font-bold text-gray-700">
                        {a.th}
                      </td>
                      <td className="px-4 lg:px-5 py-3 hidden md:table-cell">
                        <span
                          className={`text-xs font-bold ${
                            diff !== null && parseFloat(diff) > 0
                              ? "text-secondary"
                              : diff !== null && parseFloat(diff) < 0
                              ? "text-red-500"
                              : "text-gray-500"
                          }`}
                        >
                          {live
                            ? `${diff !== null ? (parseFloat(diff) > 0 ? "+" : "") + diff + "%" : "--"}`
                            : "loading..."}
                        </span>
                      </td>
                      <td className="px-4 lg:px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${a.sCls}`}
                        >
                          {a.st}
                        </span>
                      </td>
                      <td className="px-4 lg:px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="p-1 text-gray-400 hover:text-primary hover:bg-indigo-50 rounded-lg transition-all">
                            <Pencil size={14} />
                          </button>
                          <button className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-gray-200 text-center">
            <button className="text-[10px] text-primary font-bold hover:underline">
              View All Alert History
            </button>
          </div>
        </section>
      </div>

      {/* Toast */}
      <div
        className="fixed bottom-6 right-6 translate-y-20 opacity-0 transition-all duration-500 z-[100]"
        id="toast"
      >
        <div className="bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-400" />
          <div>
            <p className="text-xs font-bold">Alert Created</p>
            <p className="text-[10px] opacity-80">
              We will notify you at the threshold
            </p>
          </div>
          <button
            className="ml-2 opacity-60 hover:opacity-100"
            onClick={() => {
              const t = document.getElementById("toast");
              if (t) {
                t.classList.add("translate-y-20", "opacity-0");
                t.classList.remove("translate-y-0", "opacity-100");
              }
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </main>
  );
}