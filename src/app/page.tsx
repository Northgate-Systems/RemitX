"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Menu,
  X,
  Wallet,
  Zap,
  ShieldCheck,
  Shield,
  User,
  Network,
  Banknote,
  Landmark,
  Gauge,
  PiggyBank,
  DollarSign,
  PoundSterling,
  Repeat,
} from "lucide-react";

const CURRENCY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  attach_money: DollarSign,
  payments: Banknote,
  currency_pound: PoundSterling,
  currency_exchange: Repeat,
};

const LIVE_CURRENCIES = [
  { icon: "attach_money", code: "USD", name: "US Dollar" },
  { icon: "payments", code: "NGN", name: "Nigerian Naira" },
  { icon: "currency_pound", code: "GBP", name: "British Pound" },
  { icon: "currency_exchange", code: "PHP", name: "Philippine Peso" },
];

const LIVE_RATE_POLL_MS = 15_000;

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [usdToNgn, setUsdToNgn] = useState<number | null>(null);
  const [cardRates, setCardRates] = useState<Record<string, number>>({});
  const [ratesLoading, setRatesLoading] = useState(true);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Real, always-live currency rates - no static/example numbers.
  useEffect(() => {
    let ignore = false;

    const loadLiveRates = async () => {
      try {
        const results = await Promise.all(
          LIVE_CURRENCIES.filter((c) => c.code !== "USD").map(async (c) => {
            const res = await fetch(`/api/public/rate?from=USD&to=${c.code}`);
            const json = await res.json();
            return { code: c.code, rate: res.ok ? parseFloat(json.data.rate) : null };
          })
        );
        if (ignore) return;

        const next: Record<string, number> = {};
        for (const r of results) {
          if (r.rate !== null) next[r.code] = r.rate;
        }
        setCardRates(next);
        if (next.NGN) setUsdToNgn(next.NGN);
      } catch {
        // Keep last known values on a transient failure
      } finally {
        if (!ignore) setRatesLoading(false);
      }
    };

    loadLiveRates();
    const interval = setInterval(loadLiveRates, LIVE_RATE_POLL_MS);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {/* Top Nav */}
      <nav className={`h-header-height fixed top-0 right-0 left-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-surface-container-lowest shadow-sm py-2" : "bg-surface-container-lowest/80 backdrop-blur-md"
      } flex justify-between items-center px-4 lg:px-8 w-full`}>
        <div className="flex items-center gap-2">
          <Landmark size={20} className="text-primary animate-spin-reveal" />
          <span className="font-bold text-lg text-primary tracking-tight">RemitX</span>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Link href="/login" className="text-sm font-semibold text-primary">Personal</Link>
          <span className="text-sm text-gray-300 cursor-not-allowed" title="Coming soon">Business</span>
          <span className="text-sm text-gray-300 cursor-not-allowed" title="Coming soon">Developers</span>
          <span className="text-sm text-gray-300 cursor-not-allowed" title="Coming soon">Institutional</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:block px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 rounded-lg transition-all active:scale-95">Sign In</Link>
          <Link href="/login" className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-2">
            <Wallet size={18} />
            <span className="hidden sm:inline">Get Started</span>
            <span className="sm:hidden">Wallet</span>
          </Link>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-500 hover:text-primary rounded-lg hover:bg-gray-50 transition-all">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`fixed top-[72px] left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-lg transition-all duration-300 md:hidden ${
        mobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
      }`}>
        <div className="p-4 space-y-1">
          <Link href="/login" className="block px-4 py-3 rounded-lg text-sm text-gray-600 hover:text-primary hover:bg-gray-50 transition-all" onClick={() => setMobileMenuOpen(false)}>Personal</Link>
          {["Business", "Developers", "Institutional"].map((item) => (
            <span key={item} className="block px-4 py-3 rounded-lg text-sm text-gray-300">{item} <span className="text-[10px]">(soon)</span></span>
          ))}
          <hr className="border-gray-100 my-2" />
          <Link href="/login" className="block px-4 py-3 text-sm font-semibold text-primary" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
        </div>
      </div>

      <main className="pt-[72px]">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-gray-50 min-h-[600px] lg:min-h-[800px] flex items-center px-4 lg:px-8">
          {/* Animated particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400/30 animate-particle" style={{ left: `${15 + i * 18}%`, top: `${30 + i * 12}%`, animationDelay: `${i * 1.2}s`, animationDuration: `${6 + i * 2}s` }} />
            ))}
            <div className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-[100px] animate-breath-glow"></div>
            <div className="absolute bottom-20 right-10 w-80 h-80 bg-secondary/5 rounded-full blur-[100px] animate-breath-glow" style={{ animationDelay: "2s" }}></div>
          </div>

          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center w-full relative z-10">
            <div className="py-8 lg:py-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-4 animate-elastic">
                <Zap size={14} />
                Stellar Network Live
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-primary mb-4 leading-tight animate-slide-blur">
                Send money <br />
                <span className="animate-shimmer-text">smarter, cheaper, faster.</span>
              </h1>
              <p className="text-lg text-gray-500 max-w-lg mb-6 animate-slide-blur delay-100">
                RemitX leverages the Stellar Network to deliver instant cross-border settlements with 99% lower fees.
              </p>
              <div className="flex flex-wrap gap-3 animate-slide-blur delay-200">
                <Link href="/login" className="px-6 py-3 text-sm font-semibold bg-primary text-white rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95">
                  Get Started
                </Link>
                <button className="px-6 py-3 text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-all active:scale-95">
                  View Rates
                </button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-gray-400 animate-slide-blur delay-300">
                <div className="flex items-center gap-1"><ShieldCheck size={14} />SEC Compliant</div>
                <div className="flex items-center gap-1"><Shield size={14} />Bank-Grade Security</div>
              </div>
            </div>

            {/* Stellar Visual */}
            <div className="relative h-[350px] lg:h-[450px] w-full flex items-center justify-center animate-scale-cascade delay-200">
              <div className="absolute inset-0 bg-primary/5 rounded-full blur-[100px] animate-breath-glow"></div>
              <div className="relative w-full h-full max-w-sm float-animation">
                <div className="absolute top-1/2 left-0 -translate-y-1/2 glass-card p-3 rounded-xl shadow-lg z-20 card-magnetic">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white"><User size={18} /></div>
                    <div><p className="text-[9px] text-gray-400 uppercase font-semibold">Sender (USD)</p><p className="text-sm font-bold text-primary">$1,000.00</p></div>
                  </div>
                </div>
                <svg className="absolute inset-0 w-full h-full" fill="none" viewBox="0 0 400 400">
                  <path className="stellar-line opacity-20" d="M100 200 C 150 200, 150 100, 200 100" stroke="#000666" strokeWidth="2" />
                  <path className="stellar-line opacity-20" d="M100 200 C 150 200, 150 300, 200 300" stroke="#000666" strokeWidth="2" />
                  <path className="stellar-line opacity-20" d="M200 100 C 250 100, 250 200, 300 200" stroke="#000666" strokeWidth="2" />
                  <path className="stellar-line opacity-20" d="M200 300 C 250 300, 250 200, 300 200" stroke="#000666" strokeWidth="2" />
                  <circle cx="200" cy="100" fill="#006b5c" r="4" />
                  <circle cx="200" cy="300" fill="#006b5c" r="4" />
                </svg>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-card p-2.5 rounded-full border-2 border-secondary shadow-xl z-30 animate-ripple-wave">
                  <Network size={24} className="text-secondary" />
                </div>
                <div className="absolute top-1/2 right-0 -translate-y-1/2 glass-card p-3 rounded-xl shadow-lg z-20 card-magnetic">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-white"><Banknote size={18} /></div>
                    <div><p className="text-[9px] text-gray-400 uppercase font-semibold">Receiver (NGN)</p><p className="text-sm font-bold text-secondary">
                      {usdToNgn ? `₦${(1000 * usdToNgn).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "Loading…"}
                    </p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Currency Cards */}
        <section className="py-12 lg:py-16 px-4 lg:px-8 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8 animate-slide-blur">
              <h2 className="text-2xl lg:text-3xl font-bold text-primary mb-2">Supported Corridors</h2>
              <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${ratesLoading ? "bg-amber-400" : "bg-emerald-400"} animate-pulse`}></span>
                Live rates, refreshing every {LIVE_RATE_POLL_MS / 1000}s
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
              {LIVE_CURRENCIES.map((currency, i) => (
                <div key={currency.code} className="glass-card p-5 rounded-xl flex flex-col items-center text-center hover:shadow-md transition-all group card-magnetic animate-elastic" style={{ animationDelay: `${i * 150}ms` }}>
                  <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center mb-2 group-hover:bg-primary transition-all duration-500">
                    {(() => {
                      const CurrencyIcon = CURRENCY_ICONS[currency.icon] || DollarSign;
                      return <CurrencyIcon size={20} className="text-primary group-hover:text-white transition-colors duration-500" />;
                    })()}
                  </div>
                  <p className="text-sm font-bold text-primary">{currency.code}</p>
                  <p className="text-xs text-gray-500">{currency.name}</p>
                  <p className="text-[10px] font-semibold text-secondary mt-1.5">
                    {currency.code === "USD"
                      ? "Base currency"
                      : cardRates[currency.code]
                      ? `1 USD = ${cardRates[currency.code].toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                      : "Loading…"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bento Grid */}
        <section className="py-12 lg:py-16 px-4 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 glass-card p-6 lg:p-8 rounded-2xl flex flex-col justify-between overflow-hidden relative card-magnetic animate-scale-cascade">
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-primary mb-3">Institutional-Grade Infrastructure</h3>
                  <p className="text-sm text-gray-500 max-w-md">We provide the same level of security and compliance expected by major financial institutions.</p>
                </div>
                <div className="mt-6 flex flex-wrap gap-4 z-10">
                  <div className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-secondary" /><span className="text-xs font-semibold">Encryption</span></div>
                  <div className="flex items-center gap-1.5"><Landmark size={14} className="text-secondary" /><span className="text-xs font-semibold">Regulated Anchors</span></div>
                </div>
                <div className="absolute -right-10 -bottom-10 opacity-5"><Shield size={200} /></div>
              </div>
              <div className="bg-primary p-6 lg:p-8 rounded-2xl text-white card-magnetic animate-scale-cascade delay-100">
                <Gauge size={24} className="mb-3 animate-orbit" />
                <h3 className="text-lg font-bold mb-1">Sub-5 Second</h3>
                <p className="text-sm opacity-80">Transactions finalized in seconds, not days.</p>
              </div>
              <div className="glass-card p-6 lg:p-8 rounded-2xl border-2 border-emerald-100 card-magnetic animate-scale-cascade delay-200">
                <PiggyBank size={24} className="text-secondary mb-3" />
                <h3 className="text-lg font-bold text-primary mb-1">Zero Hidden Fees</h3>
                <p className="text-sm text-gray-500">Exact amounts, total transparency.</p>
              </div>
              <div className="md:col-span-2 glass-card p-6 lg:p-8 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 card-magnetic animate-scale-cascade delay-300">
                <div>
                  <h3 className="text-lg font-bold text-primary mb-1">Developer Ready API</h3>
                  <p className="text-sm text-gray-500">Robust SDK and documentation.</p>
                </div>
                <button className="px-5 py-2.5 bg-gray-100 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-all">Read Docs</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 w-full py-4 border-t border-gray-200 mt-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center px-4 lg:px-8 gap-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Landmark size={18} className="text-primary" />
              <span className="text-sm font-bold text-gray-800">RemitX</span>
            </div>
            <span className="text-xs text-gray-400">© 2026 RemitX. Powered by Stellar.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/legal/privacy" className="text-xs text-gray-400 hover:text-primary transition-colors">Privacy</Link>
            <Link href="/legal/terms" className="text-xs text-gray-400 hover:text-primary transition-colors">Terms</Link>
            <Link href="/legal/compliance" className="text-xs text-gray-400 hover:text-primary transition-colors">Compliance</Link>
            <Link href="/legal/security" className="text-xs text-gray-400 hover:text-primary transition-colors">Security</Link>
          </div>
        </div>
      </footer>
    </>
  );
}