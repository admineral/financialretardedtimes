import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { Workspace } from "@/components/archive/Workspace";
import { defaultReplay } from "@/lib/newspaper-v3/schema";
import { listRuns } from "@/lib/newspaper-v3/store";
import { ReplayApp } from "./ReplayApp";
export const metadata: Metadata = {
  title: "Zukunftslabor · Financial Retarded Times",
  description:
    "Ein experimentelles Chat-Replay mit echten Bitcoin-Kursen und fiktiven Reaktionen.",
};
async function Experiment() {
  await connection();
  return <ReplayApp defaults={defaultReplay()} />;
}
async function SavedRuns() {
  let runs;
  try {
    runs = await listRuns();
  } catch {
    return (
      <p className="aw-note">
        Gespeicherte Experimente sind momentan nicht erreichbar.
      </p>
    );
  }
  return (
    <section style={{ marginTop: 44 }}>
      <div className="aw-panel-head">
        <h2 className="aw-section-title">Bisherige Experimente</h2>
        <span className="aw-count">{runs.length} Ausgaben</span>
      </div>
      {runs.length ? (
        runs.map((run) => (
          <Link
            className="aw-run-link"
            key={run.id}
            href={`/newspaper/v3/${run.id}`}
          >
            <span>
              {run.headline ?? "Replay der Community"}
              <small className="aw-note" style={{ display: "block" }}>
                {run.input_data.replayFrom} – {run.input_data.replayTo}
              </small>
            </span>
            <span className="aw-count">
              {run.status === "succeeded"
                ? "Ausgabe lesen →"
                : run.status === "failed"
                  ? "Fehlgeschlagen"
                  : "In Arbeit"}
            </span>
          </Link>
        ))
      ) : (
        <p className="aw-note">
          Noch keine generierte Ausgabe. Beginne oben mit einer Prüfung der
          Eingabe.
        </p>
      )}
    </section>
  );
}
export default function ReplayPage() {
  return (
    <Workspace active="replay">
      <div className="aw-intro">
        <div>
          <div className="aw-eyebrow">
            <span className="aw-dot" /> Newspaper v3 · Experiment
          </div>
          <h1 className="aw-title">Wenn der Chat weiterlebt.</h1>
          <p>
            Der Markt bewegt sich weiter. Was hätte die Community dazu gesagt?
            Wir spielen eine vergangene Woche nach — mit echten Kursen und
            ausdrücklich erfundenen Stimmen.
          </p>
        </div>
        <span className="aw-tag">FUTURE LAB / 03</span>
      </div>
      <div className="aw-steps">
        <article>
          <b>01</b>
          <h2>Die Stimmen kennenlernen</h2>
          <p>
            Alle gespeicherten Originalnachrichten im gewählten
            Trainingszeitraum. Standard: 30 Tage.
          </p>
        </article>
        <article>
          <b>02</b>
          <h2>Den Markt weiterspielen</h2>
          <p>
            Sieben weitere Tage mit echten BTC-Kursen. Ihre Nachrichten kennt
            das Modell nicht.
          </p>
        </article>
        <article>
          <b>03</b>
          <h2>Eine mögliche Zeitung lesen</h2>
          <p>
            Fiktive Artikel, Gespräche und Rückkehrer. Historische Quellen und
            Vergleich bleiben sichtbar.
          </p>
        </article>
      </div>
      <Suspense
        fallback={<div className="aw-loading">Experiment öffnen …</div>}
      >
        <Experiment />
      </Suspense>
      <Suspense fallback={<div className="aw-loading">Ausgaben laden …</div>}>
        <SavedRuns />
      </Suspense>
    </Workspace>
  );
}
