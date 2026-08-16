import Link from "next/link";
import { Landmark, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Landmark size={28} className="text-primary" />
          <span className="font-bold text-2xl text-primary">RemitX</span>
        </div>

        <div className="text-[120px] lg:text-[160px] font-bold text-primary/10 leading-none select-none animate-elastic">
          404
        </div>

        <h1 className="text-2xl lg:text-3xl font-bold text-primary mb-3 animate-slide-blur">
          Page not found
        </h1>
        <p className="text-sm text-gray-500 mb-8 animate-slide-blur delay-100">
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-blur delay-200">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all active:scale-95"
          >
            <Home size={16} />
            Back to Home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all active:scale-95"
          >
            <ArrowLeft size={16} />
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}