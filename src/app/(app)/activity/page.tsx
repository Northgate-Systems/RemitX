"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  ArrowUpRight,
  ArrowLeftRight,
  History,
  ListFilter,
  Search,
} from "lucide-react";

interface Transaction {
  id: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string | null;
  recipientAddress: string;
  status: "pending" | "validating" | "confirmed" | "failed";
  stellarTxHash: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<Transaction["status"], string> = {
  pending: "bg-gray-100 text-gray-600",
  validating: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const FILTERS: Array<"all" | Transaction["status"]> = ["all", "pending", "validating", "confirmed", "failed"];

function ActivityInner() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/transactions?limit=50");
        const json = await res.json();
        if (res.ok) {
          setTransactions(json.data.transactions);
        } else {
          setError(json.error || "Couldn't load activity.");
        }
      } catch {
        setError("Couldn't reach the server.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const byStatus = filter === "all" ? transactions : transactions.filter((t) => t.status === filter);
  const filtered = q
    ? byStatus.filter(
        (t) =>
          t.recipientAddress.toLowerCase().includes(q) ||
          t.fromAsset.toLowerCase().includes(q) ||
          t.toAsset.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
      )
    : byStatus;

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          <span className="text-primary font-bold">Activity</span>
        </nav>

        {q && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit">
            <Search size={14} />
            Showing results for &quot;{q}&quot;
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-primary">All Transactions</h2>
          <div className="flex items-center gap-1 text-gray-400">
            <ListFilter size={16} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as (typeof FILTERS)[number])}
              className="text-xs font-semibold text-gray-600 bg-transparent outline-none"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>{f === "all" ? "All statuses" : f}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <History size={32} className="text-gray-300" />
              <p className="text-sm font-medium text-gray-600">
                {filter === "all" ? "No transactions yet" : `No ${filter} transactions`}
              </p>
              <p className="text-xs text-gray-400 mb-3">Your sends will show up here.</p>
              <Link href="/send" className="text-xs font-semibold text-primary hover:underline">Send money →</Link>
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
                    <th className="px-4 lg:px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-all duration-200 cursor-pointer">
                      <td className="px-4 lg:px-5 py-3">
                        <Link href={`/activity/${tx.id}`} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            {tx.fromAsset === tx.toAsset ? <ArrowLeftRight size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              {tx.fromAmount} {tx.fromAsset} → {tx.toAsset}
                            </p>
                            <p className="text-xs text-gray-400 truncate max-w-[200px]">{tx.recipientAddress}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 lg:px-5 py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {new Date(tx.createdAt).toLocaleString()}
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
                      <td className="px-4 lg:px-5 py-3 text-right">
                        <Link href={`/activity/${tx.id}`}>
                          <ChevronRight size={16} className="text-gray-300" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityInner />
    </Suspense>
  );
}
