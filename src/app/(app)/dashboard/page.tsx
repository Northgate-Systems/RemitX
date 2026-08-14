"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Rocket,
  CircleDollarSign,
  ArrowUpRight,
  ArrowLeftRight,
  Filter,
  Download,
  ArrowRight,
  Activity as ActivityIcon,
} from "lucide-react";

interface Balance {
  asset: string;
  balance: string;
}

interface Transaction {
  id: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string | null;
  recipientAddress: string;
  status: "pending" | "validating" | "confirmed" | "failed";
  createdAt: string;
}

interface NetworkStatus {
  ledgerSequence: number;
  baseFeeStroops: number;
  closedAt: string;
}

const STATUS_STYLE: Record<Transaction["status"], string> = {
  pending: "bg-gray-100 text-gray-600",
  validating: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export default function DashboardPage() {
  const mainRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [activated, setActivated] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const loadData = async () => {
    try {
      const [balanceRes, txRes, statusRes] = await Promise.all([
        fetch("/api/stellar/balance"),
        fetch("/api/transactions?limit=5"),
        fetch("/api/stellar/status"),
      ]);

      if (balanceRes.ok) {
        const json = await balanceRes.json();
        setActivated(json.data.activated);
        setBalances(json.data.balances);
      }
      if (txRes.ok) {
        const json = await txRes.json();
        setTransactions(json.data.transactions);
      }
      if (statusRes.ok) {
        const json = await statusRes.json();
        setNetwork(json.data);
      }
      setError(null);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      await loadData();
      if (ignore) return;
    })();
    return () => {
      ignore = true;
    };
  }, []);

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
    document.querySelectorAll(".animate-on-scroll").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  const activateWallet = async () => {
    setActivating(true);
    try {
      const res = await fetch("/api/stellar/account", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        window.alert(
          `Testnet wallet created.\n\nSave your secret key now — it will not be shown again:\n\n${json.data.secretKey}`
        );
        setLoading(true);
        await loadData();
      } else {
        setError(json.error || "Failed to activate wallet");
      }
    } catch {
      setError("Failed to activate wallet");
    } finally {
      setActivating(false);
    }
  };

  const xlmBalance = balances.find((b) => b.asset === "XLM");

  return (
    <main ref={mainRef} className="p-4 lg:p-6 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="lg:hidden mb-4">
          <h2 className="text-xl font-bold text-primary">Global Overview</h2>
          <p className="text-sm text-gray-500">Welcome back.</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-12 gap-3 lg:gap-4">
          <div className="hidden lg:block col-span-12 mb-2 animate-slide-blur">
            <h2 className="text-2xl font-bold text-primary">Global Overview</h2>
            <p className="text-sm text-gray-500">Your real Stellar balance and recent activity.</p>
          </div>

          <div className="col-span-12 lg:col-span-8 space-y-3 lg:space-y-4">
            {!activated && !loading ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 opacity-0 animate-on-scroll">
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800 mb-1">Activate your Stellar wallet</p>
                  <p className="text-xs text-amber-700">
                    You don&apos;t have a Stellar account yet. Activate one on testnet to see a real
                    balance and start sending.
                  </p>
                </div>
                <button
                  onClick={activateWallet}
                  disabled={activating}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all shrink-0"
                >
                  {activating ? "Activating…" : "Activate wallet"}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                <div className="bg-primary text-white rounded-xl p-5 shadow-sm overflow-hidden relative group opacity-0 animate-on-scroll">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold">Main Wallet</p>
                        <h3 className="text-base font-bold">Stellar Lumens</h3>
                      </div>
                      <div className="bg-white/10 p-1.5 rounded-lg">
                        <Rocket size={18} />
                      </div>
                    </div>
                    {loading ? (
                      <div className="h-8 w-40 bg-white/10 rounded animate-pulse mb-4" />
                    ) : (
                      <div className="mb-4">
                        <p className="text-2xl lg:text-3xl font-bold leading-none mb-1">
                          {xlmBalance ? `${parseFloat(xlmBalance.balance).toFixed(2)} XLM` : "0.00 XLM"}
                        </p>
                        <p className="text-xs text-white/70">Testnet balance, live from Horizon</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Link href="/send" className="flex-1 bg-white/10 hover:bg-white/20 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 text-center">Send</Link>
                      <Link href="/activity" className="flex-1 bg-white/10 hover:bg-white/20 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 text-center">History</Link>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm relative overflow-hidden group opacity-0 animate-on-scroll" style={{ animationDelay: "100ms" }}>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Other Assets</p>
                        <h3 className="text-base font-bold text-gray-800">Held on-chain</h3>
                      </div>
                      <div className="bg-emerald-50 p-1.5 rounded-lg text-secondary">
                        <CircleDollarSign size={18} />
                      </div>
                    </div>
                    {balances.filter((b) => b.asset !== "XLM").length === 0 ? (
                      <p className="text-sm text-gray-400">No other assets yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {balances
                          .filter((b) => b.asset !== "XLM")
                          .map((b) => (
                            <p key={b.asset} className="text-lg font-bold text-gray-800">
                              {parseFloat(b.balance).toFixed(2)} {b.asset}
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden opacity-0 animate-on-scroll" style={{ animationDelay: "300ms" }}>
              <div className="px-4 lg:px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <h4 className="text-sm font-bold text-gray-800">Recent Activity</h4>
                <div className="flex gap-1">
                  <button className="p-1 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-50"><Filter size={18} /></button>
                  <button className="p-1 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-50"><Download size={18} /></button>
                </div>
              </div>
              {loading ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
                  <ActivityIcon size={32} className="text-gray-300" />
                  <p className="text-sm font-medium text-gray-600">No transactions yet</p>
                  <p className="text-xs text-gray-400">Send your first transfer to see it here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                      <tr>
                        <th className="px-4 lg:px-5 py-2.5">Transaction</th>
                        <th className="px-4 lg:px-5 py-2.5 hidden sm:table-cell">Date</th>
                        <th className="px-4 lg:px-5 py-2.5 text-right">Amount</th>
                        <th className="px-4 lg:px-5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-all duration-200">
                          <td className="px-4 lg:px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                {tx.fromAsset === tx.toAsset ? <ArrowLeftRight size={16} /> : <ArrowUpRight size={16} />}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {tx.fromAmount} {tx.fromAsset} → {tx.toAsset}
                                </p>
                                <p className="text-xs text-gray-400 truncate max-w-[160px]">{tx.recipientAddress}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 lg:px-5 py-3 text-xs text-gray-500 hidden sm:table-cell">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 lg:px-5 py-3 text-right">
                            <p className="text-sm font-semibold text-gray-800">
                              {tx.toAmount ? `${tx.toAmount} ${tx.toAsset}` : "—"}
                            </p>
                          </td>
                          <td className="px-4 lg:px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLE[tx.status]}`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-3 lg:space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm opacity-0 animate-on-scroll" style={{ animationDelay: "300ms" }}>
              <h4 className="text-sm font-bold text-gray-800 mb-4">Quick Send</h4>
              <p className="text-xs text-gray-500 mb-3">
                Pick a corridor and get a live quote before you send.
              </p>
              <Link
                href="/send"
                className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-bold hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Send money <ArrowRight size={18} />
              </Link>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm opacity-0 animate-on-scroll" style={{ animationDelay: "400ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Network Status</h4>
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${network ? "bg-emerald-400 animate-pulse" : "bg-gray-300"}`}></div>
                  <span className="text-[10px] font-bold text-secondary">{network ? "Live" : "—"}</span>
                </div>
              </div>
              {network ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-end border-b border-gray-100 pb-2">
                    <span className="text-xs text-gray-400">Latest ledger</span>
                    <span className="text-sm font-semibold text-gray-800">#{network.ledgerSequence.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-gray-100 pb-2">
                    <span className="text-xs text-gray-400">Base fee</span>
                    <span className="text-sm font-semibold text-gray-800">{network.baseFeeStroops} stroops</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-xs text-gray-400">Closed at</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {new Date(network.closedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Fetching live Horizon status…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
