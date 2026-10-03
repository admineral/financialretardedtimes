import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Workspace } from "@/components/archive/Workspace";
import { BtcChart } from "@/components/archive/ArchiveVisuals";
import { getRun } from "@/lib/newspaper-v3/store";
import { issueSchema, replaySchema } from "@/lib/newspaper-v3/schema";
import type { ArchiveMessage, BtcHistory } from "@/lib/archive/types";
import { RunStatus } from "./RunStatus";
import { Comparison } from "./Comparison";
function Evidence({
  ids,
  evidence,
}: {
  ids: string[];
  evidence: ArchiveMessage[];
}) {
  if (!ids.length) return null;
  return (
    <details className="aw-evidence">
      <summary>
        Historische Belege ({ids.length}) · echte Originalnachrichten
      </summary>
      {ids.map((id) => {
        const m = evidence.find((item) => item.id === id);
        return m ? (
          <blockquote key={id}>
            <strong>{m.username}</strong> · {m.timestamp ?? m.date}
            <br />
            {m.originalText}
          </blockquote>
        ) : null;
      })}
    </details>
  );
}
async function Edition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let run;
  try {
    run = await getRun(id);
  } catch {
    return (
      <div className="aw-error">
        Die Ausgabe ist momentan nicht erreichbar. Bitte erneut laden.
      </div>
    );
  }
  if (!run) notFound();
  if (run.status === "running") return <RunStatus id={id} />;
  if (run.status === "failed")
    return (
      <div className="aw-panel">
        <h1 className="aw-section-title">
          Das Experiment wurde nicht abgeschlossen.
        </h1>
        <p className="aw-note" style={{ margin: "16px 0" }}>
          {run.error}
        </p>
        <Link className="aw-button" href="/newspaper/v3">
          Zurück zum Labor
        </Link>
      </div>
    );
  const issue = issueSchema.parse(run.output_data.issue),
    input = replaySchema.parse(run.input_data.input);
  const evidence = run.output_data.evidence as ArchiveMessage[],
    btc = run.output_data.btc as BtcHistory;
  return (
    <>
      <div className="aw-eyebrow">
        Experimentelle Ausgabe · {run.input_data.replayFrom} —{" "}
        {run.input_data.replayTo}
      </div>
      <p className="aw-note" style={{ margin: "14px 0 26px" }}>
        Alle Artikel und Chatbeiträge dieser Ausgabe sind KI-generierte Fiktion.
        Die historischen Belege und Kurse sind separat gekennzeichnet.
      </p>
      <article className="aw-edition">
        <h1>{issue.headline}</h1>
        <p className="aw-deck">{issue.deck}</p>
        <BtcChart history={btc} />
        <div className="aw-articles">
          {issue.articles.map((a, i) => (
            <section key={i}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
              <Evidence ids={a.sourceIds} evidence={evidence} />
            </section>
          ))}
        </div>
      </article>
      <div className="aw-grid aw-edition-grid">
        <section className="aw-panel">
          <div className="aw-panel-head">
            <h2>So hätte es klingen können</h2>
            <span className="aw-count">FIKTIVER CHAT</span>
          </div>
          {issue.chat.map((m, i) => (
            <article className="aw-message" key={i}>
              <div className="aw-avatar">
                {m.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <header>
                  <strong>{m.username}</strong>
                  <time>
                    {m.timestamp.replace("T", " ").replace("Z", " UTC")}
                  </time>
                </header>
                <p>{m.text}</p>
                <Evidence ids={m.sourceIds} evidence={evidence} />
              </div>
            </article>
          ))}
        </section>
        <aside className="aw-panel">
          <div className="aw-section-label">Mögliche Rückkehrer</div>
          <h2>Wer wäre dabei?</h2>
          {issue.participants.map((p) => (
            <section key={p.username} style={{ marginTop: 24 }}>
              <strong>{p.username}</strong>
              <p className="aw-note" style={{ marginTop: 8 }}>
                {p.reason}
              </p>
              <Evidence ids={p.sourceIds} evidence={evidence} />
            </section>
          ))}
        </aside>
      </div>
      <Comparison
        room={input.room}
        from={run.input_data.replayFrom}
        to={run.input_data.replayTo}
      />
      <p className="aw-note" style={{ marginTop: 24 }}>
        Modell: {run.model} · Prompt: {run.prompt_version} · Training:{" "}
        {input.trainingFrom} — {input.cutoff} ·{" "}
        {run.input_data.coverage.messageCount} Originalnachrichten
      </p>
    </>
  );
}
export default function EditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Workspace active="replay">
      <Suspense fallback={<div className="aw-loading">Ausgabe laden …</div>}>
        <Edition params={params} />
      </Suspense>
    </Workspace>
  );
}
