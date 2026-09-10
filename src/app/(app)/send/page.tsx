"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, AtSign, ArrowRight, Info, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { checkStellarPublicKey, STELLAR_PUBLIC_KEY_LENGTH } from "@/lib/stellar-address";
import { toMinorUnits, fromMinorUnits, convertMinorUnits, sanitizeAmountInput } from "@/lib/currency";

const ASSETS = ["XLM", "USDC", "USD", "NGN", "PHP", "GBP"];
const QUOTE_REFRESH_MS = 15_000;

export default function SendMoneyPage() {
  const router = useRouter();
  const [fromAsset, setFromAsset] = useState("USD");
  const [toAsset, setToAsset] = useState("NGN");
  const [amount, setAmount] = useState("100.00");
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [rate, setRate] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<Date | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateRef = useRef<string | null>(null);

  const fetchQuote = useCallback(async () => {
    setRateLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stellar/rate?from=${fromAsset}&to=${toAsset}`);
      const json = await res.json();
      if (res.ok) {
        if (rateRef.current && rateRef.current !== json.data.rate) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 1500);
        }
        rateRef.current = json.data.rate;
        setRate(json.data.rate);
        setRateUpdatedAt(new Date());
      } else {
        setError(json.error || "Couldn't fetch a rate for this corridor.");
        setRate(null);
      }
    } catch {
      setError("Couldn't reach the server for a live rate.");
      setRate(null);
    } finally {
      setRateLoading(false);
    }
  }, [fromAsset, toAsset]);

  // Debounced refetch when the corridor changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchQuote, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchQuote]);

  // Keep the quote live while the user is composing a send, so the rate
  // shown at "Continue" time is never more than QUOTE_REFRESH_MS stale.
  useEffect(() => {
    const interval = setInterval(fetchQuote, QUOTE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchQuote]);

  // Kept as an exact integer count of minor units (cents) rather than a
  // float - see src/lib/currency.ts for why parseFloat(amount) here would
  // reintroduce the precision bug this replaced.
  const amountMinor = toMinorUnits(amount);
  const convertedMinor =
    amountMinor !== null && rate ? convertMinorUnits(amountMinor, parseFloat(rate)) : 0;
  const convertedDisplay = fromMinorUnits(convertedMinor);

  // Checksum-validate the recipient as it's typed. Funds sent on Stellar are
  // irreversible, so a typo has to be caught here rather than by Horizon.
  const trimmedRecipient = recipient.trim();
  const recipientCheck = checkStellarPublicKey(trimmedRecipient);
  // Don't scold someone mid-paste: only surface the error once they've left
  // the field or typed something already long enough to be a full address.
  const showRecipientError =
    !recipientCheck.valid &&
    trimmedRecipient.length > 0 &&
    (recipientTouched || trimmedRecipient.length >= STELLAR_PUBLIC_KEY_LENGTH);
  const canContinue =
    amountMinor !== null && amountMinor > 0 && recipientCheck.valid && !!rate && !rateLoading;

  const handleContinue = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stellar/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAsset,
          toAsset,
          amount: amount,
          recipientAddress: recipient.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        sessionStorage.setItem(
          `remitx:tx:${json.data.transactionId}`,
          JSON.stringify({
            transactionId: json.data.transactionId,
            xdr: json.data.xdr,
            fromAsset: json.data.fromAsset,
            toAsset: json.data.toAsset,
            fromAmount: json.data.fromAmount,
            toAmount: json.data.toAmount,
            recipientAddress: json.data.recipientAddress,
          })
        );
        router.push(`/review?transactionId=${json.data.transactionId}`);
      } else {
        setError(json.error || "Couldn't start this transfer.");
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <div className="mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-primary mb-1">Send Money Globally</h2>
          <p className="text-sm text-gray-500">Live rates, routed over the Stellar network.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
          {/* Left - Form */}
          <div className="lg:col-span-7 space-y-4">
            <section className="bg-white rounded-xl shadow-sm p-5 lg:p-6 border border-gray-200">
              <h3 className="text-base font-bold text-gray-800 mb-5 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-primary" />
                Transfer Details
              </h3>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 ml-1">You Send</label>
                  <div className="flex items-stretch border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm">
                    {/* A money field, not a spinner: type="number" hands back
                        whatever the browser considers a valid float, including
                        scientific notation ("1e5"), so the raw value can
                        disagree with what the user thinks they typed. text +
                        inputMode="decimal" still brings up a numeric keypad on
                        mobile, but the value is exactly the characters typed,
                        which sanitizeAmountInput can then constrain. */}
                    <input
                      className="flex-1 px-4 py-3.5 border-none text-lg font-bold focus:ring-0 outline-none"
                      placeholder="0.00"
                      type="text"
                      inputMode="decimal"
                      aria-label="Amount to send"
                      value={amount}
                      onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
                    />
                    <select
                      value={fromAsset}
                      onChange={(e) => setFromAsset(e.target.value)}
                      className="bg-gray-50 px-3 text-sm font-semibold text-gray-700 border-l border-gray-200 outline-none"
                    >
                      {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 ml-1">Recipient Gets</label>
                  <div className="flex items-stretch border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <input
                      className="flex-1 px-4 py-3.5 border-none text-lg font-bold bg-gray-50 focus:ring-0 text-gray-500 outline-none"
                      readOnly
                      type="text"
                      value={rateLoading ? "…" : convertedDisplay}
                    />
                    <select
                      value={toAsset}
                      onChange={(e) => setToAsset(e.target.value)}
                      className="bg-gray-50 px-3 text-sm font-semibold text-gray-700 border-l border-gray-200 outline-none"
                    >
                      {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <hr className="border-gray-100" />
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Recipient Details</h4>
                  <div className="space-y-1.5">
                    <label htmlFor="recipient-address" className="text-xs font-semibold text-gray-500 ml-1">Stellar Address</label>
                    <div className="relative">
                      <input
                        id="recipient-address"
                        className={`w-full px-4 py-2.5 rounded-xl border transition-all pl-10 pr-10 text-sm ${
                          showRecipientError
                            ? "border-red-300 focus:ring-2 focus:ring-red-200"
                            : "border-gray-200 focus:ring-2 focus:ring-primary/20"
                        }`}
                        placeholder="G..."
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        onBlur={() => setRecipientTouched(true)}
                        aria-invalid={showRecipientError}
                        aria-describedby="recipient-address-status"
                      />
                      <AtSign size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${showRecipientError ? "text-red-400" : "text-gray-400"}`} />
                      {recipientCheck.valid && (
                        <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" aria-hidden="true" />
                      )}
                    </div>
                    <p id="recipient-address-status" role="status" aria-live="polite" className="min-h-[1rem] ml-1">
                      {showRecipientError ? (
                        <span className="text-[11px] text-red-600 flex items-start gap-1 leading-relaxed">
                          <AlertCircle size={12} className="shrink-0 mt-0.5" />
                          {recipientCheck.message}
                        </span>
                      ) : recipientCheck.valid ? (
                        <span className="text-[11px] text-emerald-600">Valid Stellar address.</span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right - Summary */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <section className="bg-primary text-white rounded-xl p-5 lg:p-6 shadow-xl relative overflow-hidden">
              <h3 className="text-base font-bold mb-6 relative z-10">Transaction Summary</h3>
              <div className="space-y-4 relative z-10">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm opacity-80">
                    <span>Exchange Rate</span>
                    <span className={`font-semibold transition-colors duration-700 ${justUpdated ? "text-emerald-300" : ""}`}>
                      {rateLoading ? "Loading…" : rate ? `1 ${fromAsset} = ${parseFloat(rate).toFixed(4)} ${toAsset}` : "-"}
                    </span>
                  </div>
                  {rateUpdatedAt && (
                    <div className="flex justify-between items-center text-[10px] opacity-60">
                      <span className="flex items-center gap-1">
                        <RefreshCw size={10} className={rateLoading ? "animate-spin" : ""} />
                        Live, refreshing every {QUOTE_REFRESH_MS / 1000}s
                      </span>
                      <span>Updated {rateUpdatedAt.toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5">
                  <div className="flex flex-col items-center py-1">
                    <span className="text-[10px] opacity-70 uppercase tracking-widest mb-1">Recipient Receives</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl lg:text-3xl font-bold">{rateLoading ? "…" : convertedDisplay}</span>
                      <span className="text-sm">{toAsset}</span>
                    </div>
                  </div>
                </div>
                {error && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-900/30 rounded-lg text-red-200 text-xs leading-relaxed">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}
                <div className="flex items-start gap-2 p-2.5 bg-indigo-900/30 rounded-lg text-blue-200 text-[10px] leading-relaxed">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <p>Verify the Stellar address carefully. Funds sent cannot be recovered.</p>
                </div>
                <button
                  onClick={handleContinue}
                  disabled={!canContinue || submitting}
                  className="w-full bg-emerald-400 text-emerald-900 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                >
                  {submitting ? "Preparing transaction…" : "Continue to Review"}
                  {!submitting && <ArrowRight size={18} />}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
