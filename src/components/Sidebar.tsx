"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  PlusCircle,
  LayoutDashboard,
  Send,
  ArrowLeftRight,
  Landmark,
  LineChart,
  History,
  ClipboardCheck,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/send", icon: Send, label: "Send Money" },
  { href: "/routes", icon: ArrowLeftRight, label: "Route Comparison" },
  { href: "/anchors", icon: Landmark, label: "Anchor Fees" },
  { href: "/rates", icon: LineChart, label: "Rates/DEX" },
  { href: "/activity", icon: History, label: "Activity" },
  { href: "/review", icon: ClipboardCheck, label: "Review" },
];

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay lg:hidden ${isOpen ? "open" : ""}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside className={`w-sidebar-width h-screen fixed left-0 top-0 bg-surface/80 dark:bg-inverse-surface/90 backdrop-blur-xl border-r border-outline-variant/50 dark:border-outline/30 flex flex-col py-5 z-50 overflow-y-auto custom-scrollbar sidebar-desktop transition-all duration-300 lg:translate-x-0 ${isOpen ? "open" : ""}`}>
        {/* Logo */}
        <div className="px-5 mb-6">
          <Link href="/" className="flex items-center gap-2.5 group" onClick={onClose}>
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-on-primary shadow-lg shadow-primary/20 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-primary/30 group-hover:scale-105">
              <Landmark size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-primary dark:text-primary-fixed leading-tight">RemitX</h1>
              <p className="text-[10px] font-medium text-outline/70 dark:text-outline tracking-wider uppercase">Stellar Network</p>
            </div>
          </Link>
        </div>

        {/* Close button on mobile */}
        {onClose && (
          <button onClick={onClose} className="lg:hidden absolute top-4 right-4 p-1.5 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container-low transition-all">
            <X size={18} />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item, index) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 animate-fade-in-up ${
                  active
                    ? "text-white font-semibold"
                    : "text-on-surface-variant/70 dark:text-outline hover:text-primary dark:hover:text-primary-fixed-dim"
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Active background gradient */}
                {active && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary/70 rounded-xl shadow-lg shadow-primary/25" />
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full shadow-lg shadow-white/30" />
                    {/* Glow effect */}
                    <div className="absolute -inset-1 bg-primary/20 rounded-xl blur-md -z-10" />
                  </>
                )}

                {/* Hover background (non-active) */}
                {!active && (
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent transition-opacity duration-200" />
                )}

                {/* Icon */}
                <item.icon
                  size={18}
                  className={`relative z-10 transition-all duration-300 ${
                    active ? "text-white" : "group-hover:scale-110 group-hover:text-primary dark:group-hover:text-primary-fixed-dim"
                  }`}
                />

                {/* Label */}
                <span className={`relative z-10 text-sm transition-all duration-200 ${
                  active ? "text-white" : "group-hover:translate-x-0.5"
                }`}>
                  {item.label}
                </span>

                {/* Active indicator dot */}
                {active && (
                  <span className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm shadow-white/50 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-3 mt-auto pt-4 border-t border-outline-variant/30 dark:border-outline/20 space-y-1">
          <Link
            href="/"
            className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-medium text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all duration-200 overflow-hidden"
            onClick={onClose}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <PlusCircle size={18} className="relative z-10" />
            <span className="relative z-10">Add Funds</span>
          </Link>
          <Link
            href="/support"
            className="flex items-center gap-3 px-3 py-2 text-xs text-on-surface-variant/60 hover:text-primary rounded-xl hover:bg-primary/5 transition-all duration-200"
          >
            <HelpCircle size={18} />
            <span>Support</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs text-on-surface-variant/60 hover:text-error rounded-xl hover:bg-error/5 transition-all duration-200"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}