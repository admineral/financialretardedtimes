import Link from "next/link";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import "./workspace.css";
export function Workspace({
  active,
  children,
}: {
  active: "archive" | "replay";
  children: React.ReactNode;
}) {
  return (
    <div className="archive-workspace">
      <header className="aw-header">
        <Link href="/newspaper" className="aw-brand">
          <span className="aw-monogram">FRT</span>
          <span>
            Financial Retarded Times<small>THE COMMUNITY RECORD</small>
          </span>
        </Link>
        <nav aria-label="Werkzeuge">
          <Link
            href="/newspaper/export"
            aria-current={active === "archive" ? "page" : undefined}
          >
            Archiv & Export
          </Link>
          <Link href="/newspaper/people">Netzwerk</Link>
          <Link
            href="/newspaper/v3"
            aria-current={active === "replay" ? "page" : undefined}
          >
            Zukunftslabor <ArrowUpRight size={13} />
          </Link>
          <ThemeSwitcher />
        </nav>
      </header>
      <main className="aw-main">{children}</main>
      <footer className="aw-footer">
        <span>Financial Retarded Times · Community archive</span>
        <Link href="/newspaper">
          <ArrowLeft size={13} /> Zur Zeitung
        </Link>
      </footer>
    </div>
  );
}
