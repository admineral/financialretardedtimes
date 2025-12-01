import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CurrentDate } from "@/components/current-date";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center text-xs text-muted-foreground">
          <CurrentDate />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Leser-Dashboard</span>
            <ThemeSwitcher />
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 border-b-4 border-double border-foreground/60">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-masthead text-3xl md:text-4xl lg:text-5xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-xs md:text-sm tracking-[0.3em] uppercase text-muted-foreground mt-1">
            Mein Konto • Leser-Dashboard
          </p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="w-full border-b border-foreground/20 py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 flex justify-center items-center">
          <div className="flex gap-6 font-headline text-sm tracking-wide">
            <Link href="/" className="hover:text-primary transition-colors">← Zurück zur Titelseite</Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </div>

      {/* Footer */}
      <footer className="w-full border-t-2 border-foreground/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center text-xs text-muted-foreground font-body">
            <p>© 2025 Financial Retarded Times • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
