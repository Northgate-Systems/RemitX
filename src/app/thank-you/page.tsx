import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Home, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Thank You",
  description: "Thank you for using RemitX. Your transaction was successful.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 animate-elastic">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold text-primary mb-3 animate-slide-blur">
          Thank You!
        </h1>
        <p className="text-sm text-gray-500 mb-8 animate-slide-blur delay-100">
          Your transaction has been processed successfully over the Stellar Network.
          You can track its status in your activity feed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-blur delay-200">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all active:scale-95"
          >
            <Home size={16} />
            Go to Dashboard
          </Link>
          <Link
            href="/send"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all active:scale-95"
          >
            <Send size={16} />
            Send Another
          </Link>
        </div>

        <Link
          href="/activity"
          className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-6 hover:underline animate-slide-blur delay-300"
        >
          View transaction in Activity <ArrowRight size={14} />
        </Link>
      </div>
    </main>
  );
}