import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { HORIZONS, type Horizon } from "@/lib/newspaper-v4/config";
import { defaultEditionInput } from "@/lib/newspaper-v4/schema";
import { latestEditionId, listEditions } from "@/lib/newspaper-v4/store";
import { EditionLoader } from "./EditionLoader";
import { Shell } from "./Shell";
import { Studio } from "./Studio";
import { longDate } from "./format";

export const metadata: Metadata = {
  title: "KI-Ausgabe · Financial Retarded Times",
  description:
    "Eine interaktive Zeitung, die eine KI aus dem Chat-Stil und dem echten BTC-Kurs schreibt.",
};

async function Front() {
  await connection();
  let latest, editions;
  try {
    [latest, editions] = await Promise.all([latestEditionId(), listEditions()]);
  } catch {
    return (
      <>
        <Studio defaults={defaultEditionInput()} startOpen />
        <p className="v4-error">
          Die Ausgaben-Tabelle ist nicht erreichbar. Wurde die Migration
          20261003000000_newspaper_v4_editions.sql eingespielt?
        </p>
      </>
    );
  }
  return (
    <>
      <Studio defaults={defaultEditionInput()} startOpen={!latest} />
      {latest ? (
        <EditionLoader id={latest} />
      ) : (
        <div className="v4-pending">
          <h2>Noch keine KI-Ausgabe.</h2>
          <p>Wähle oben einen Zeitraum und drucke die erste Ausgabe.</p>
        </div>
      )}
      <section className="v4-block" id="ausgaben">
        <div className="v4-block-head">
          <h2>Alle Ausgaben</h2>
          <span className="v4-label">{editions.length} gedruckt</span>
        </div>
        <ul className="v4-archive">
          {editions.map((e) => (
            <li key={e.id}>
              <Link href={`/newspaper/v4/${e.id}`}>
                <span className="v4-label">
                  {longDate(new Date(e.created_at).toISOString())} ·{" "}
                  {HORIZONS[e.horizon as Horizon]?.label ?? e.horizon}
                </span>
                <strong>
                  {e.status === "succeeded"
                    ? e.headline
                    : e.status === "failed"
                      ? "Druck fehlgeschlagen"
                      : "Im Druck …"}
                </strong>
                {e.mood !== null && (
                  <span className={e.mood >= 0 ? "v4-up" : "v4-down"}>
                    Stimmung {e.mood > 0 ? "+" : ""}
                    {e.mood}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function AiEditionPage() {
  return (
    <Shell>
      <Suspense fallback={<div className="v4-pending"><p>Zeitung wird aufgeschlagen …</p></div>}>
        <Front />
      </Suspense>
    </Shell>
  );
}
