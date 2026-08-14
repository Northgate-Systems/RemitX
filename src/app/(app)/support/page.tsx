import { Mail, ShieldAlert, FileText, Github } from "lucide-react";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 lg:py-8 space-y-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-primary mb-1">Support</h2>
          <p className="text-sm text-gray-500">RemitX is on Stellar testnet — here&apos;s where to go if something&apos;s wrong.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://github.com/Northgate-Systems/RemitX/issues"
            target="_blank"
            rel="noreferrer"
            className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-3 hover:shadow-md transition-all"
          >
            <Github size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-800">Report an issue</p>
              <p className="text-xs text-gray-500 mt-1">File a bug on the RemitX GitHub repository.</p>
            </div>
          </a>

          <a
            href="mailto:bidifortune@gmail.com"
            className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-3 hover:shadow-md transition-all"
          >
            <Mail size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-800">Email the team</p>
              <p className="text-xs text-gray-500 mt-1">Questions about a transaction, an anchor listing, or the project.</p>
            </div>
          </a>

          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-3">
            <ShieldAlert size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-800">Testnet only</p>
              <p className="text-xs text-gray-500 mt-1">
                All funds and transactions here are on Stellar testnet. Never send real assets or reuse a mainnet secret key.
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-3">
            <FileText size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-800">How sending works</p>
              <p className="text-xs text-gray-500 mt-1">
                Activate a wallet on the Dashboard, then Send builds a Stellar path payment, Review signs and submits it, and Activity tracks it to confirmation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
