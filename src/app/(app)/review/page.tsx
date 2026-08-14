"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  AlertTriangle,
  Send,
  Link2,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

interface StoredTx {
  transactionId: string;
  xdr: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string;
  recipientAddress: string;
}

function ReviewInner() {
  const params = useSearchParams();
  const transactionId = params.get("transactionId");

  const [tx] = useState<StoredTx | null>(() => {
    if (typeof window === "undefined" || !transactionId) return null;
    const raw = sessionStorage.getItem(`remitx:tx:${transactionId}`);
    return raw ? JSON.parse(raw) : null;
  });
  const [secretKey, setSecretKey] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "confirmed" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleConfirm = async () => {
    if (!tx || !secretKey.trim()) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/stellar/sign-and-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: tx.transactionId,
          xdr: tx.xdr,
          secretKey: secretKey.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.data.status === "confirmed") {
        setStatus("confirmed");
        setHash(json.data.stellarTxHash);
        sessionStorage.removeItem(`remitx:tx:${tx.transactionId}`);
      } else {
        setStatus("failed");
        setError(json.data?.resultCode || json.error || "Horizon rejected this transaction.");
      }
    } catch {
      setStatus("failed");
      setError("Couldn't reach the server.");
    }
  };

  const copyHash = () => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!transactionId) {
    return (
      <main className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <p className="text-sm text-gray-500">No transaction to review. <Link href="/send" className="text-primary font-semibold">Start a new send</Link>.</p>
      </main>
    );
  }

  if (!tx) {
    return (
      <main className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <p className="text-sm text-gray-500">
          This transaction isn&apos;t in this browser session anymore. <Link href="/send" className="text-primary font-semibold">Start a new send</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <div className="flex flex-wrap items-center gap-1.5 mb-5 text-xs text-gray-400 font-semibold">
          <Link href="/send" className="hover:text-primary transition-colors">Send Money</Link>
          <ChevronRight size={14} />
          <span className="text-primary font-bold">Review & Confirm</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Left */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5 lg:p-6 border border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h2 className="text-base font-bold text-primary">Transaction Summary</h2>
                <div className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck size={14} />
                  <span className="text-[10px] font-bold">Secured by Stellar</span>
                </div>
              </div>
              <div className="text-center py-6 border-b border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total to Recipient</p>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-800">
                  {tx.toAmount} <span className="text-sm text-gray-400 font-semibold">{tx.toAsset}</span>
                </h3>
              </div>
              <div className="space-y-3 py-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Sending Amount</span>
                  <span className="font-semibold text-gray-800">{tx.fromAmount} {tx.fromAsset}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-secondary font-bold">
                  <span>Exchange Rate</span>
                  <span>
                    1 {tx.fromAsset} = {(parseFloat(tx.toAmount) / parseFloat(tx.fromAmount)).toFixed(4)} {tx.toAsset}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center border border-gray-200">
                <span className="text-sm font-bold text-primary">Total Cost</span>
                <span className="text-sm font-bold text-primary">{tx.fromAmount} {tx.fromAsset}</span>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-3 items-start">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-red-700 mb-0.5 uppercase">Security Verification</p>
                <p className="text-[10px] text-gray-500">Double-check the recipient&apos;s wallet address. Assets sent on Stellar cannot be reversed.</p>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
              <h4 className="text-[10px] text-gray-400 font-bold uppercase mb-3">Recipient</h4>
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">Stellar Public Key</label>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <code className="text-[10px] text-gray-500 break-all">{tx.recipientAddress}</code>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 space-y-3">
              {status !== "confirmed" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Your Stellar secret key</label>
                    <input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="S..."
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Testnet-only: used once to sign this transaction, never stored.
                    </p>
                  </div>
                  <button
                    onClick={handleConfirm}
                    disabled={!secretKey.trim() || status === "submitting"}
                    className="w-full bg-secondary text-white text-sm font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-800 transition-all shadow-md disabled:opacity-50"
                  >
                    <Send size={16} />
                    {status === "submitting" ? "Signing & submitting…" : "Confirm & Send"}
                  </button>
                  <Link
                    href="/send"
                    className="w-full block text-center bg-gray-50 text-gray-500 text-xs font-semibold py-3 rounded-xl border border-gray-200 hover:bg-gray-100 transition-all"
                  >
                    Cancel & Edit
                  </Link>
                </>
              )}

              {status === "failed" && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5">{error}</p>
              )}

              {status === "confirmed" && hash && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <ShieldCheck size={16} />
                    <span className="text-sm font-bold">Transaction confirmed</span>
                  </div>
                  <button
                    onClick={copyHash}
                    className="w-full flex items-center justify-between gap-1.5 text-gray-500 bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-all"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] truncate">
                      <Link2 size={14} /> {hash}
                    </span>
                    {copied ? <Check size={14} className="text-emerald-600 shrink-0" /> : <Copy size={14} className="shrink-0" />}
                  </button>
                  <Link href="/activity" className="w-full block text-center bg-primary text-white text-xs font-semibold py-2.5 rounded-xl">
                    View in Activity
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewInner />
    </Suspense>
  );
}
