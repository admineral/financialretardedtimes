import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { GuestbookChat } from "@/components/guestbook-chat";
import { CurrentDate } from "@/components/current-date";
import { VerifiedMemberBadge } from "@/components/verified-member-badge";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <CurrentDate />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Vol. 1 • No. 1</span>
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
      <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-masthead text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-[10px] sm:text-xs md:text-sm lg:text-base tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
            Tradingview Edition • Die Stimme des Krypto-Chats
          </p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="w-full border-b border-foreground/20 py-2 sm:py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex gap-3 sm:gap-4 md:gap-6 font-headline text-xs sm:text-sm tracking-wide">
            <Link href="/" className="hover:text-primary transition-colors font-semibold">Analysen</Link>
            <Link href="/" className="hover:text-primary transition-colors">Community</Link>
            <Link href="/" className="hover:text-primary transition-colors">Trending</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <input 
              type="text" 
              placeholder="Suchen..." 
              className="hidden lg:block px-3 py-1.5 text-sm border border-foreground/20 bg-transparent rounded-sm font-body focus:outline-none focus:border-primary/50 w-40"
            />
            <button className="px-2 sm:px-4 py-1 sm:py-1.5 bg-primary text-primary-foreground text-xs sm:text-sm font-headline tracking-wide hover:bg-primary/90 transition-colors">
              PUBLISH
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Grid */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          
          {/* Left Sidebar */}
          <aside className="lg:col-span-2 hidden lg:block">
            <div className="sticky top-20">
              {/* Verified Member Highlight - shown first for logged in users */}
              <Suspense>
                <VerifiedMemberBadge />
              </Suspense>

              <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
                Top Trader
              </h3>
              <ul className="space-y-3 font-body text-sm">
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">C</span>
                  CharlieTheUnicorn73
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">S</span>
                  SwingMann
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">R</span>
                  roland_cristal
                </li>
              </ul>

              <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
                Trending Themen
              </h3>
              <ul className="space-y-2 font-body text-sm">
                <li className="text-primary hover:underline cursor-pointer">#btcmarktstruktur</li>
                <li className="text-primary hover:underline cursor-pointer">#altcoinsusecase</li>
                <li className="text-primary hover:underline cursor-pointer">#influencerundsocialmedia</li>
                <li className="text-primary hover:underline cursor-pointer">#strategiemstrjpm</li>
                <li className="text-primary hover:underline cursor-pointer">#politikmedien</li>
              </ul>

              <div className="mt-8 pt-4 border-t border-foreground/20">
                <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Community Highlights
                </h3>
                <p className="text-xs text-muted-foreground font-body leading-relaxed">
                  Top Beitragender diese Woche
                </p>
                <p className="font-headline font-semibold text-sm mt-1">CharlieTheUnicorn73</p>
                <p className="text-xs text-muted-foreground">3 Qualitätsbeiträge</p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-7">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b-2 border-foreground/60">
              <h2 className="font-headline text-xl sm:text-2xl font-bold">Titelseite</h2>
              <div className="flex gap-1 sm:gap-2 text-[10px] sm:text-xs font-headline">
                <button className="px-2 sm:px-3 py-1 border border-foreground/40 hover:bg-muted transition-colors">NEUESTE</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">TRENDING</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">VERIFIZIERT</button>
              </div>
            </div>

            {/* Featured Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">Redaktion</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">2025-11-27</span>
                <span className="ml-auto px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary text-[10px] sm:text-xs font-semibold rounded border border-primary/30">ANALYSE</span>
              </div>
              <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors">
                Ist das schon der Bärenmarkt – oder erst Welle A?
              </h3>
              <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                Aus den Chatlogs lässt sich eine umfassende Debatte rekonstruieren, ob der aktuelle BTC-Rückgang bereits den Beginn eines Bärenmarkts markiert oder 'nur' eine scharfe Korrektur im ...
              </p>
              <blockquote className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4 italic font-body text-muted-foreground text-sm sm:text-base">
                „Aus den Chatlogs lässt sich eine umfassende Debatte rekonstruieren, ob der aktuelle BTC-Rückgang ber..."
              </blockquote>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@Elliotwone</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@roland_cristal</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@SwingMann</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@Tragegurt</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                <Link href="/" className="text-primary font-headline hover:underline">Weiterlesen →</Link>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  <span className="text-green-600 font-semibold">94% verifiziert</span> • 24.680 Leser • 342 Kommentare • 7 Shares
                </span>
              </div>
            </article>

            {/* Secondary Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">ROLAND_CRISTAL</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">2025-11-27</span>
                <span className="ml-auto px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary text-[10px] sm:text-xs font-semibold rounded border border-primary/30">ANALYSE</span>
              </div>
              <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                Kaspa, HBAR, XRP & Co – was taugen die Usecases?
              </h3>
              <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                Auf die Frage von mustangchefe nach HBAR entwickelt sich eine lange Usecase-Debatte. Roland_cristal erklärt Hadera/Hashgraph, Zentralisierungsprobleme und vergleicht HBAR mit XRP a...
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@roland_cristal</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@mustangchefe</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">@Elliotwone</span>
              </div>
            </article>

            {/* Third Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">SWINGMANN</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">2025-11-26</span>
                <span className="ml-auto px-1.5 sm:px-2 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs font-semibold rounded border border-amber-500/30">MEINUNG</span>
              </div>
              <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                Die Psychologie des Dips: Warum wir immer zu früh kaufen
              </h3>
              <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
                Eine ehrliche Analyse der Community-Reaktionen auf den jüngsten Kursrutsch zeigt wiederkehrende Muster im Kaufverhalten...
              </p>
            </article>

            {/* More Articles Teaser */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <article className="pb-3 sm:pb-4 border-b border-foreground/10">
                <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">Kultur</span>
                <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                  Meme-Coins und die Kunst der Ironie
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-body">Wie die Community mit Humor auf Marktbewegungen reagiert...</p>
              </article>
              <article className="pb-3 sm:pb-4 border-b border-foreground/10">
                <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">Technische Analyse</span>
                <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                  Elliott-Wellen für Anfänger erklärt
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-body">Elliotwone gibt Nachhilfe in Wellentheorie...</p>
              </article>
            </div>
          </main>

          {/* Right Sidebar - Chat */}
          <aside className="lg:col-span-3">
            <div className="sticky top-20">
              {/* Mini Articles Above Chat */}
              <div className="hidden lg:block mb-6">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
                  <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Kurzmeldungen</h3>
                </div>
                
                <article className="mb-4 pb-4 border-b border-foreground/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">ELLIOTWONE</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">2025-11-27</span>
                    <span className="ml-auto px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-semibold rounded">MEINUNG</span>
                  </div>
                  <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                    Influencer, Hoss & der schmale Grat zwischen Trade und Show
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 font-body line-clamp-2">
                    Der Influencer Hoss sorgt im Chat für Gesprächsstoff: angebliche Monster-Longs, Nachschieben von Margin kurz vor Liquida...
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">INFLUENCER UND SOCIAL MEDIA</span>
                    <span className="text-[10px] text-green-600 font-semibold">92%</span>
                  </div>
                </article>

                <article className="mb-4 pb-4 border-b border-foreground/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">CHARLIETHEUNICORN73</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">2025-11-27</span>
                    <span className="ml-auto px-1.5 py-0.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold rounded">KULTUR</span>
                  </div>
                  <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                    Von BTC zu 88 – wenn der Krypto-Chat politisch wird
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 font-body line-clamp-2">
                    Eine scheinbar harmlose Bemerkung von CharlieTheUnicorn73 zur 88 im Nicknamen von TheRisingAngel-88 eskaliert zu einer G...
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">POLITIK MEDIEN • MEMES UND KULTUR</span>
                    <span className="text-[10px] text-green-600 font-semibold">90%</span>
                  </div>
                </article>
              </div>

              {/* Chat Section */}
              <div className="border-2 border-foreground/30 bg-card">
                <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Live-Ticker</h3>
                      <p className="text-[10px] text-muted-foreground font-body">Echtzeit Community Chat</p>
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      LIVE
                    </span>
                  </div>
                </div>
                <GuestbookChat />
              </div>

              {/* Newsletter */}
              <div className="mt-6 p-4 border-2 border-foreground/20 bg-muted/30">
                <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2">Newsletter</h4>
                <p className="text-xs text-muted-foreground font-body mb-3">
                  Die wichtigsten Chat-Highlights direkt in Ihr Postfach.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="E-Mail Adresse" 
                    className="flex-1 px-3 py-1.5 text-xs font-body bg-background border border-foreground/20 focus:outline-none focus:border-primary/50"
                  />
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-headline tracking-wide hover:bg-primary/90 transition-colors">
                    OK
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t-2 border-foreground/20 mt-8 sm:mt-12">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          {/* Links Row */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm font-body">
            <span className="text-muted-foreground">Rubriken:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Analysen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Meinungen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Kultur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Marktstruktur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Altcoins</span>
            <span className="text-foreground/30">|</span>
            <span className="text-muted-foreground">Community:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Top Autoren</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Leaderboard</span>
          </div>
          
          {/* Copyright */}
          <div className="text-center text-xs text-muted-foreground font-body">
            <p>© 2025 Financial Retarded Times • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
