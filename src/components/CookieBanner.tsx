"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("remitx_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("remitx_cookie_consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("remitx_cookie_consent", "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 lg:p-6 pointer-events-none">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 lg:p-6 pointer-events-auto animate-slide-blur">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Cookie size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-800 mb-1">We use cookies</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              We use cookies to improve your experience, analyze site traffic, and remember your preferences.
              By continuing to use RemitX, you agree to our{" "}
              <Link href="/legal/privacy" className="text-primary font-semibold hover:underline">Privacy Policy</Link>{" "}
              and{" "}
              <Link href="/legal/terms" className="text-primary font-semibold hover:underline">Terms of Service</Link>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={accept}
                className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:shadow-md transition-all active:scale-95"
              >
                Accept All
              </button>
              <button
                onClick={decline}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-all active:scale-95"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}