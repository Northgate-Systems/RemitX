import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";

const PAGES: Record<string, { title: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    body: "RemitX is currently in active development on Stellar testnet. A full privacy policy will be published here before any mainnet launch or handling of real user data.",
  },
  terms: {
    title: "Terms of Service",
    body: "Terms of service will be published here before mainnet launch. Everything in this product today runs on Stellar testnet for development and demonstration purposes only.",
  },
  compliance: {
    title: "Compliance",
    body: "RemitX has not yet completed KYC/AML or regulatory review in any jurisdiction. No real funds move through this product today — it operates on Stellar testnet only.",
  },
  security: {
    title: "Security",
    body: "Found a security issue? Please report it via the Support page rather than a public GitHub issue. RemitX is pre-audit and testnet-only — do not use real Stellar secret keys with this product.",
  },
};

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();

  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-10 space-y-4">
        <Link href="/" className="inline-flex items-center gap-2 text-primary font-bold text-sm mb-4">
          <Landmark size={18} /> RemitX
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">{page.title}</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{page.body}</p>
      </div>
    </main>
  );
}
