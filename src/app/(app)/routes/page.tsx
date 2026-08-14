"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Zap, RefreshCw, ArrowRight, Sparkles } from "lucide-react";

interface Route {
  sourceAmount: string;
  destinationAmount: string;
  path: string[];
}

const ASSETS = ["XLM", "USDC", "EURC"];

export default function RoutesPage() {
  const [fromAsset, setFromAsset] = useState("USDC");
  const [toAsset, setToAsset] = useState("XLM");
  const [amount, setAmount] = useState("1000");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stellar/routes?from=${fromAsset}&to=${toAsset}&amount=${amount}`);
      const json = await res.json();
      if (res.ok) {
        setRoutes(json.data.routes);
        setLastUpdated(new Date());
      } else {
        setRoutes([]);
        setError(json.error || "No route available for this pair right now.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [fromAsset, toAsset, amount]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      await search();
      if (ignore) return;
    })();
    return () => {
      ignore = true;
    };
  }, [search]);

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-primary mb-1">Path Payment Router</h2>
            <p className="text-sm text-gray-500 max-w-2xl">Real on-chain routes across the Stellar DEX, live from Horizon.</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold">
              <Zap size={12} className="mr-1" />Live
            </span>
            {lastUpdated && (
              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">
                <RefreshCw size={12} className="mr-1" />Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Query bar */}
        <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">You Send</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold"
                />
                <select value={fromAsset} onChange={(e) => setFromAsset(e.target.value)} className="border border-gray-200 rounded-lg text-sm font-semibold px-2 py-1.5">
                  {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 hidden sm:inline mt-4" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">They Receive</p>
              <select value={toAsset} onChange={(e) => setToAsset(e.target.value)} className="border border-gray-200 rounded-lg text-sm font-semibold px-2 py-1.5">
                {ASSETS.filter((a) => a !== fromAsset).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={search}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold active:scale-95 transition-all"
          >
            {loading ? "Searching…" : "Find routes"}
          </button>
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

        {/* Routes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
          {loading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-56 bg-white border border-gray-200 rounded-2xl animate-pulse" />)
          ) : routes.length === 0 ? (
            <div className="md:col-span-3 bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">
              No routes found for {fromAsset} → {toAsset} at this amount.
            </div>
          ) : (
            routes.map((route, i) => (
              <div
                key={i}
                className={`flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden transition-all group relative ${
                  i === 0 ? "border-2 border-primary" : "border border-gray-200"
                }`}
              >
                {i === 0 && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm">
                      <Sparkles size={12} /> BEST VALUE
                    </div>
                  </div>
                )}
                <div className="p-4 lg:p-5 border-b border-gray-100">
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">
                    {route.path.length > 2 ? `${route.path.length - 2}-hop route` : "Direct"}
                  </p>
                  <h3 className={`text-base font-bold mb-3 ${i === 0 ? "text-primary" : "text-gray-800"}`}>
                    {route.destinationAmount} {toAsset}
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">You send</span>
                    <span className="text-sm font-semibold text-gray-700">{route.sourceAmount} {fromAsset}</span>
                  </div>
                </div>
                <div className="p-4 lg:p-5 flex-grow">
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Path</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {route.path.map((p, pi) => (
                      <React.Fragment key={pi}>
                        <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-[8px] text-gray-700">{p}</div>
                        {pi < route.path.length - 1 && <div className="flex-1 h-px bg-gray-200 min-w-[8px]"></div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
