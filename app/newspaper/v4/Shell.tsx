import Link from "next/link";
import { Fraunces, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { ThemeSwitcher } from "@/components/theme-switcher";
import "./v4.css";

const display = Fraunces({ subsets: ["latin"], variable: "--v4-display", axes: ["opsz", "SOFT"] });
const body = Source_Serif_4({ subsets: ["latin"], variable: "--v4-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--v4-mono" });

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`frt4 ${display.variable} ${body.variable} ${mono.variable}`}>
      <nav className="v4-nav" aria-label="Navigation">
        <Link href="/newspaper/v4" className="v4-nav-brand">
          FRT <span>KI-Ausgabe</span>
        </Link>
        <div>
          <Link href="/newspaper">Echte Zeitung</Link>
          <Link href="/newspaper/v4#ausgaben">Alle Ausgaben</Link>
          <Link href="/newspaper/export">Archiv</Link>
          <ThemeSwitcher />
        </div>
      </nav>
      <main className="v4-main">{children}</main>
    </div>
  );
}
