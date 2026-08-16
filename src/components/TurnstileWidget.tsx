"use client";

import { useEffect, useRef, useId, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerId = `turnstile-${useId().replace(/:/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) {
      onVerify("dev-skip-no-site-key");
      return;
    }

    function render() {
      if (!window.turnstile) return;
      const el = document.getElementById(containerId);
      if (!el || widgetIdRef.current) return;
      try {
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: SITE_KEY as string,
          callback: onVerify,
          "expired-callback": onExpire,
          "error-callback": () => {
            setError("Verification challenge failed. Please check your connection and try again.");
            onExpire?.();
          },
          theme: "light",
        });
        setError(null);
      } catch (e) {
        setError("Could not load the verification widget. Please refresh the page.");
      }
    }

    if (window.turnstile) {
      render();
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        setError("Failed to load the verification script. Check your network connection.");
      };
      document.head.appendChild(script);
    }
    window.onTurnstileLoad = render;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  if (!SITE_KEY) {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
        Cloudflare Turnstile is not configured yet - set{" "}
        <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> in .env to enable
        verification. Continuing without it for now.
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
        {error}
      </div>
    );
  }

  return <div id={containerId} />;
}