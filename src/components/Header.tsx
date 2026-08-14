"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, Search, Bell, Wallet } from "lucide-react";
import Link from "next/link";
import Sidebar from "./Sidebar";

interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  stellarPublicKey: string | null;
  kycStatus: "pending" | "verified" | "rejected";
}

export default function Header() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const json = await res.json();
        if (!ignore) setUser(json.data.user);
      } catch {
        // Header degrades gracefully without a profile if this fails
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const initials = user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : "--";

  const submitSearch = () => {
    if (!query.trim()) return;
    router.push(`/activity?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="h-header-height fixed top-0 right-0 left-0 lg:left-sidebar-width z-40 bg-surface-container-lowest/95 dark:bg-surface-dim backdrop-blur-md border-b border-outline-variant dark:border-outline shadow-sm flex justify-between items-center px-margin-mobile lg:px-margin-desktop transition-all duration-300">
        {/* Left side - Mobile hamburger + search */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container-low transition-all active:scale-90"
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="relative w-full hidden sm:block">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              className="w-full bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-primary-container text-body-sm transition-all duration-300 focus:bg-surface-container-lowest"
              placeholder="Search transactions, anchors..."
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            />
          </div>
          {/* Mobile search icon */}
          <button onClick={submitSearch} className="sm:hidden p-2 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container-low transition-all">
            <Search size={20} />
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-space-lg">
          {/* Notification bell with shake animation */}
          <button className="relative p-2 text-on-surface-variant hover:text-primary transition-all rounded-lg hover:bg-surface-container-low active:scale-90 group">
            <Bell size={20} className="group-hover:animate-shake" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full animate-breath"></span>
          </button>

          {/* Wallet */}
          <Link href="/dashboard" className="hidden sm:flex p-2 text-on-surface-variant hover:text-primary transition-all rounded-lg hover:bg-surface-container-low active:scale-90">
            <Wallet size={20} />
          </Link>

          {/* Divider */}
          <div className="h-8 w-px bg-outline-variant mx-1"></div>

          {/* Profile */}
          <div className="flex items-center gap-2 sm:gap-space-sm cursor-pointer group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-primary-container bg-primary flex items-center justify-center text-on-primary font-bold text-sm transition-all duration-300 group-hover:shadow-lg group-hover:scale-105">
              {initials}
            </div>
            <div className="hidden lg:block text-left">
              <p className="font-label-md text-on-surface leading-tight">
                {user ? `${user.firstName} ${user.lastName}` : "Loading…"}
              </p>
              <p className="text-[10px] text-outline uppercase tracking-wider font-bold">
                {user ? `KYC: ${user.kycStatus}` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}