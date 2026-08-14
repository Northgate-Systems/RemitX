"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Link2,
  Copy,
  Check,
  Lock,
  Unlock,
  RotateCcw,
  Clock,
} from "lucide-react";

interface TransactionDetail {
  id: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string | null;
  recipientAddress: string;
  status: "pending" | "validating" | "confirmed" | "failed";
  stellarTxHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

interface EscrowDetail {
  id: string;
  status: "locked" | "released" | "refunded" | "expired";
  amount: string;
  asset: string;
  expiresAt: string;
}

const STATUS_STYLE: Record<TransactionDetail["status"], string> = {
  pending: "bg-gray-100 text-gray-600",
  validating: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const ESCROW_ICON: Record<EscrowDetail["status"], typeof Lock> = {
  locked: Lock,
  released: Unlock,
  refunded: RotateCcw,
  expired: Clock,
};

export default function TransactionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [escrow, setEscrow] = useState<EscrowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/transactions/${id}`);
        const json = await res.json();
        if (res.ok) {
          setTx(json.data.transaction);
          setEscrow(json.data.escrow);
        } else {
          setError(json.error || "Transaction not found.");
        }
      } catch {
        setError("Couldn't reach the server.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const copyHash = () => {
    if (!tx?.stellarTxHash) return;
    navigator.clipboard.writeText(tx.stellarTxHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50/50 p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-40 bg-white border border-gray-200 rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (error || !tx) {
    return (
      <main className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <p className="text-sm text-gray-500">
          {error || "Transaction not found."} <Link href="/activity" className="text-primary font-semibold">Back to Activity</Link>
        </p>
      </main>
    );
  }

  const EscrowIcon = escrow ? ESCROW_ICON[escrow.status] : null;

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          <Link href="/activity" className="hover:text-primary transition-colors">Activity</Link>
          <ChevronRight size={14} />
          <span className="text-primary font-bold">{tx.id}</span>
        </nav>

        <div className="bg-white rounded-xl shadow-sm p-5 lg:p-6 border border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Transaction</p>
              <h2 className="text-xl font-bold text-gray-800">
                {tx.fromAmount} {tx.fromAsset} → {tx.toAmount ?? "?"} {tx.toAsset}
              </h2>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLE[tx.status]}`}>
              {tx.status}
            </span>
          </div>

          <div className="space-y-3 py-4 border-t border-gray-100">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Recipient</span>
              <code className="text-xs text-gray-700 break-all text-right">{tx.recipientAddress}</code>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Created</span>
              <span className="font-semibold text-gray-800">{new Date(tx.createdAt).toLocaleString()}</span>
            </div>
            {tx.confirmedAt && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Confirmed</span>
                <span className="font-semibold text-gray-800">{new Date(tx.confirmedAt).toLocaleString()}</span>
              </div>
            )}
            {tx.stellarTxHash && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Stellar tx hash</span>
                <button onClick={copyHash} className="flex items-center gap-1.5 text-primary font-semibold text-xs">
                  <Link2 size={13} />
                  <span className="truncate max-w-[160px]">{tx.stellarTxHash}</span>
                  {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {escrow && EscrowIcon && (
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">Escrow status</h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700">
                <EscrowIcon size={12} /> {escrow.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {escrow.amount} {escrow.asset} held in the Soroban escrow contract, expires {new Date(escrow.expiresAt).toLocaleString()}.
            </p>
            <button
              disabled
              title="Escrow release authorization isn't implemented yet - see contracts/escrow/README.md"
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-400 cursor-not-allowed"
            >
              Release (pending authorization design)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
