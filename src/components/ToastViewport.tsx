"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { subscribeToasts, dismissToast, type Toast } from "@/lib/toast-store";

const VARIANT_STYLES: Record<Toast["variant"], string> = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  info: "bg-gray-50 text-gray-800 border-gray-200",
};

const VARIANT_ICON: Record<Toast["variant"], typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export default function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const Icon = VARIANT_ICON[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2 border rounded-xl px-3 py-2.5 shadow-sm text-sm ${VARIANT_STYLES[t.variant]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
