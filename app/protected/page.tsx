"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Link as LinkIcon,
  Copy,
  Check,
  RefreshCw,
  Shield,
  TrendingUp,
  MessageSquare,
  Sparkles,
} from "lucide-react";

// Generate a 4-letter verification code
const generateVerificationCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Removed I and O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// Generate random display name
const generateDisplayName = () => {
  const adjectives = [
    "Bullish",
    "Diamond",
    "Golden",
    "Silver",
    "Crypto",
    "Moon",
    "Rocket",
    "Swift",
    "Smart",
    "Alpha",
  ];
  const nouns = [
    "Trader",
    "Whale",
    "Hodler",
    "Analyst",
    "Bear",
    "Bull",
    "Wolf",
    "Shark",
    "Eagle",
    "Phoenix",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
};

const USER_DISPLAY_NAME_KEY = "frt_display_name";
const USER_VERIFICATION_CODE_KEY = "frt_verification_code";
const USER_TRADINGVIEW_LINKED_KEY = "frt_tradingview_linked";

export default function ProtectedPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [tradingViewLinked, setTradingViewLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load user and settings
  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUser({ email: data.user.email });
      }
      setIsLoading(false);
    };

    // Load display name from localStorage
    const storedName = localStorage.getItem(USER_DISPLAY_NAME_KEY);
    if (storedName) {
      setDisplayName(storedName);
    } else {
      const newName = generateDisplayName();
      setDisplayName(newName);
      localStorage.setItem(USER_DISPLAY_NAME_KEY, newName);
    }

    // Load or generate verification code
    const storedCode = localStorage.getItem(USER_VERIFICATION_CODE_KEY);
    if (storedCode) {
      setVerificationCode(storedCode);
    } else {
      const newCode = generateVerificationCode();
      setVerificationCode(newCode);
      localStorage.setItem(USER_VERIFICATION_CODE_KEY, newCode);
    }

    // Load TradingView linked status
    const linked = localStorage.getItem(USER_TRADINGVIEW_LINKED_KEY);
    setTradingViewLinked(linked === "true");

    loadUser();
  }, []);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(verificationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [verificationCode]);

  const handleRegenerateCode = useCallback(() => {
    const newCode = generateVerificationCode();
    setVerificationCode(newCode);
    localStorage.setItem(USER_VERIFICATION_CODE_KEY, newCode);
    setTradingViewLinked(false);
    localStorage.setItem(USER_TRADINGVIEW_LINKED_KEY, "false");
  }, []);

  const handleSaveName = useCallback(() => {
    if (tempName.trim()) {
      setDisplayName(tempName.trim());
      localStorage.setItem(USER_DISPLAY_NAME_KEY, tempName.trim());
    }
    setEditingName(false);
  }, [tempName]);

  const handleRandomName = useCallback(() => {
    const newName = generateDisplayName();
    setTempName(newName);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="border-b-2 border-foreground/60 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-headline uppercase tracking-widest text-muted-foreground">
            Willkommen
          </span>
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold mb-2">
          Leser-Dashboard
        </h1>
        <p className="font-body text-muted-foreground">
          Verwalten Sie Ihr Profil und verbinden Sie Ihren TradingView-Account
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-2 border-2 border-foreground/30 bg-card">
          <div className="px-6 py-4 border-b-2 border-foreground/30 bg-muted/50">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-primary" />
              <h2 className="font-headline text-lg font-bold uppercase tracking-wider">
                Ihr Profil
              </h2>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <label className="text-xs font-headline uppercase tracking-widest text-muted-foreground">
                E-Mail Adresse
              </label>
              <div className="px-4 py-3 bg-muted/50 border border-foreground/20 font-body">
                {user?.email || "Nicht verfügbar"}
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label className="text-xs font-headline uppercase tracking-widest text-muted-foreground">
                Anzeigename
              </label>
              <p className="text-xs text-muted-foreground font-body mb-2">
                Dieser Name kann im Chat und auf der Titelseite verwendet werden
              </p>

              {editingName ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="Ihr Anzeigename..."
                      className="font-body bg-background border-foreground/20 focus:border-primary/50"
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRandomName}
                      className="gap-2 font-headline text-xs border-foreground/20"
                    >
                      <Sparkles className="w-3 h-3" />
                      Zufällig
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveName}
                      size="sm"
                      className="font-headline text-xs tracking-wide"
                    >
                      Speichern
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingName(false)}
                      size="sm"
                      className="font-headline text-xs border-foreground/20"
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-4 py-3 bg-muted/50 border border-foreground/20 font-headline font-semibold text-lg">
                    {displayName}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTempName(displayName);
                      setEditingName(true);
                    }}
                    className="font-headline text-xs border-foreground/20"
                  >
                    Ändern
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="border-2 border-foreground/30 bg-card">
          <div className="px-6 py-4 border-b-2 border-foreground/30 bg-muted/50">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-headline text-lg font-bold uppercase tracking-wider">
                Statistiken
              </h2>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-foreground/10">
              <span className="text-sm text-muted-foreground font-body">
                Chat-Nachrichten
              </span>
              <span className="font-headline font-bold text-lg">0</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-foreground/10">
              <span className="text-sm text-muted-foreground font-body">
                Verifizierte Trades
              </span>
              <span className="font-headline font-bold text-lg">0</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-foreground/10">
              <span className="text-sm text-muted-foreground font-body">
                Reputation
              </span>
              <span className="font-headline font-bold text-lg text-muted-foreground">
                —
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground font-body">
                Mitglied seit
              </span>
              <span className="font-headline font-semibold text-sm">
                {new Date().toLocaleDateString("de-DE", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TradingView Connection */}
      <div className="border-2 border-foreground/30 bg-card">
        <div className="px-6 py-4 border-b-2 border-foreground/30 bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-primary" />
              <h2 className="font-headline text-lg font-bold uppercase tracking-wider">
                TradingView Verbindung
              </h2>
            </div>
            {tradingViewLinked && (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-semibold rounded border border-green-500/30">
                <Shield className="w-3 h-3" />
                VERIFIZIERT
              </span>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Instructions */}
            <div className="space-y-4">
              <h3 className="font-headline font-semibold text-lg">
                So verbinden Sie Ihren Account
              </h3>
              <ol className="space-y-3 font-body text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span>
                    Kopieren Sie Ihren persönlichen Verifizierungscode
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span>
                    Öffnen Sie den TradingView-Chat (Krypto-Gruppe)
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span>
                    Posten Sie den Code als Nachricht:{" "}
                    <code className="px-1.5 py-0.5 bg-muted font-mono text-xs">
                      !verify {verificationCode}
                    </code>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <span>
                    Wir erkennen Ihre Nachricht und verknüpfen Ihren Account
                    automatisch
                  </span>
                </li>
              </ol>

              <div className="pt-4 border-t border-foreground/10">
                <div className="flex items-start gap-2 text-xs text-muted-foreground font-body">
                  <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Nach der Verifizierung werden Ihre TradingView-Beiträge mit
                    Ihrem Profil verknüpft und Sie erhalten ein Verifiziert-Badge.
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Code */}
            <div className="space-y-4">
              <label className="text-xs font-headline uppercase tracking-widest text-muted-foreground">
                Ihr Verifizierungscode
              </label>

              <div className="relative">
                <div className="flex items-center justify-center py-8 bg-muted/50 border-2 border-dashed border-foreground/30 rounded-sm">
                  <span className="font-mono text-4xl md:text-5xl font-bold tracking-[0.3em] text-primary">
                    {verificationCode}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopyCode}
                  className="flex-1 gap-2 font-headline text-xs tracking-wide"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Code kopieren
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRegenerateCode}
                  className="gap-2 font-headline text-xs border-foreground/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  Neu generieren
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground font-body text-center">
                Der Code ist einmalig und nur für Ihren Account gültig
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Preview */}
      <div className="border-2 border-foreground/30 bg-card">
        <div className="px-6 py-4 border-b-2 border-foreground/30 bg-muted/50">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-headline text-lg font-bold uppercase tracking-wider">
              Chat-Vorschau
            </h2>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-muted-foreground font-body mb-4">
            So erscheint Ihr Name im Live-Ticker:
          </p>

          <div className="px-4 py-3 bg-muted/30 border border-foreground/10 rounded-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-headline font-semibold text-sm">
                    {displayName}
                  </span>
                  {tradingViewLinked && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-semibold rounded border border-green-500/30 flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      TV
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    • gerade eben
                  </span>
                </div>
                <p className="text-sm font-body text-muted-foreground mt-1">
                  BTC sieht gut aus für einen Long bei 95k! 🚀
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
