"use client";

import { useState, useEffect } from "react";
import { Shield, Sparkles } from "lucide-react";
import Link from "next/link";

const USER_DISPLAY_NAME_KEY = "frt_display_name";
const USER_TRADINGVIEW_LINKED_KEY = "frt_tradingview_linked";

export function VerifiedMemberBadge() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user has a display name (indicates they've logged in before)
    const storedName = localStorage.getItem(USER_DISPLAY_NAME_KEY);
    const linked = localStorage.getItem(USER_TRADINGVIEW_LINKED_KEY);

    if (storedName) {
      setDisplayName(storedName);
      setIsLoggedIn(true);
      setIsVerified(linked === "true");
    }
  }, []);

  if (!isLoggedIn || !displayName) {
    return null;
  }

  return (
    <div className="mb-6 pb-4 border-b border-foreground/20">
      <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-sm">
        <div className="flex items-center gap-2 mb-2">
          {isVerified ? (
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
          <span className="text-[10px] font-headline uppercase tracking-widest text-muted-foreground">
            {isVerified ? "Verifiziertes Mitglied" : "Ihr Profil"}
          </span>
        </div>

        <p className="font-headline font-semibold text-sm">{displayName}</p>

        {isVerified ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-semibold rounded border border-green-500/30 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" />
              TradingView
            </span>
          </div>
        ) : (
          <Link
            href="/protected"
            className="inline-block mt-2 text-[10px] text-primary hover:underline font-headline uppercase tracking-wider"
          >
            Account verbinden →
          </Link>
        )}
      </div>
    </div>
  );
}

