"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addDaysToDateKey } from "../lib/timezone";
import { CONFIRMATION, type ReplayInput } from "@/lib/newspaper-v3/schema";
import type { ReplayPreview } from "@/lib/newspaper-v3/prepare";
export function ReplayApp({ defaults }: { defaults: ReplayInput }) {
  const router = useRouter();
  const [input, setInput] = useState(defaults),
    [preview, setPreview] = useState<ReplayPreview | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [generating, setGenerating] = useState(false);
  function change(next: ReplayInput) {
    setInput(next);
    setPreview(null);
    setError("");
  }
  async function inspect() {
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/newspaper-v3/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function generate() {
    if (!preview) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/newspaper-v3/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          confirmation,
          fingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      router.push(data.url);
    } catch (e) {
      setError((e as Error).message);
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  }
  return (
    <>
      <section className="aw-panel">
        <div className="aw-panel-head">
          <div>
            <div className="aw-section-label">
              01 / Das Experiment einstellen
            </div>
            <h2>Eine Woche, die anders hätte klingen können.</h2>
          </div>
          <FlaskConical size={20} />
        </div>
        <form
          className="aw-replay-form"
          onSubmit={(e) => {
            e.preventDefault();
            void inspect();
          }}
        >
          <label className="aw-field">
            Trainingsbeginn
            <input
              className="aw-input"
              type="date"
              required
              value={input.trainingFrom}
              disabled={loading}
              onChange={(e) =>
                change({ ...input, trainingFrom: e.target.value })
              }
            />
          </label>
          <label className="aw-field">
            Letzter Tag des Trainings
            <input
              className="aw-input"
              type="date"
              required
              value={input.cutoff}
              disabled={loading}
              onChange={(e) => change({ ...input, cutoff: e.target.value })}
            />
          </label>
          <div className="aw-field">
            Trainingsfenster
            <div className="aw-range-buttons">
              <button
                disabled={loading}
                type="button"
                onClick={() =>
                  change({
                    ...input,
                    trainingFrom: addDaysToDateKey(input.cutoff, -29),
                  })
                }
              >
                30 Tage
              </button>
              <button
                disabled={loading}
                type="button"
                onClick={() =>
                  change({
                    ...input,
                    trainingFrom: addDaysToDateKey(input.cutoff, -182),
                  })
                }
              >
                6 Monate
              </button>
            </div>
          </div>
          <button className="aw-button aw-button-primary" disabled={loading}>
            {loading ? "Wird geprüft …" : "Eingabe prüfen"}{" "}
            <ArrowRight size={14} />
          </button>
        </form>
        <p className="aw-note" style={{ marginTop: 18 }}>
          Bitcoin · Deutsch. Replay: {addDaysToDateKey(input.cutoff, 1)} bis{" "}
          {addDaysToDateKey(input.cutoff, 7)}. Die echten Nachrichten dieser
          Woche bleiben für den Vergleich zurückgehalten.
        </p>
      </section>
      {error && (
        <div className="aw-error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="aw-loading" role="status">
          Originalnachrichten und Kurse laden. Kontextgröße wird gemessen; noch
          kein Modellaufruf.
        </div>
      )}
      {preview && (
        <section className="aw-panel" style={{ marginTop: 24 }}>
          <div className="aw-panel-head">
            <div>
              <div className="aw-section-label">
                02 / Vollständiger Rohtext, überprüfbar
              </div>
              <h2>
                {preview.coverage.messageCount.toLocaleString("de-DE")}{" "}
                Nachrichten. Keine Zusammenfassung.
              </h2>
            </div>
            <span className="aw-tag" style={{ margin: 0 }}>
              {preview.model}
            </span>
          </div>
          <div className="aw-stats">
            <div className="aw-stat">
              <strong>{preview.coverage.participantCount}</strong>
              <small>Teilnehmer</small>
            </div>
            <div className="aw-stat">
              <strong>{preview.inputTokens.toLocaleString("de-DE")}</strong>
              <small>Eingabe-Tokens inkl. Puffer</small>
            </div>
            <div className="aw-stat">
              <strong>{preview.contextLimit.toLocaleString("de-DE")}</strong>
              <small>Kontextlimit</small>
            </div>
            <div className="aw-stat">
              <strong>${preview.estimatedInputUSD.toFixed(2)}</strong>
              <small>Geschätzte Eingabekosten</small>
            </div>
          </div>
          <p className="aw-note">
            Zusätzlich bis zu ${preview.maxOutputUSD.toFixed(2)} für{" "}
            {preview.outputReserve.toLocaleString("de-DE")} reservierte
            Ausgabe-Tokens. Abrechnung kann abweichen. Alle Originalnachrichten
            der Auswahl werden übermittelt.
          </p>
          {preview.problems.map((p) => (
            <div role="alert" className="aw-error" key={p}>
              {p}
            </div>
          ))}
          <button
            style={{ marginTop: 20 }}
            className="aw-button aw-button-primary"
            disabled={!preview.canGenerate}
            onClick={() => {
              setConfirmation("");
              setOpen(true);
            }}
          >
            Experiment generieren <ArrowRight size={14} />
          </button>
          <span className="aw-note" style={{ marginLeft: 16 }}>
            Maximal drei Starts pro UTC-Tag · ein Lauf gleichzeitig
          </span>
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!generating) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eine neue Ausgabe generieren</DialogTitle>
            <DialogDescription>
              Dies startet einen kostenpflichtigen OpenAI-Aufruf mit{" "}
              {preview?.inputTokens.toLocaleString("de-DE")} Eingabe-Tokens.
              Geschätzte Eingabe: ${preview?.estimatedInputUSD.toFixed(2)},
              Ausgabe bis ${preview?.maxOutputUSD.toFixed(2)} zusätzlich. Die
              Originaldaten bleiben unverändert.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            Zum Bestätigen exakt eingeben: <code>{CONFIRMATION}</code>
            <input
              className="border rounded p-3 bg-background"
              autoComplete="off"
              value={confirmation}
              disabled={generating}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            className="border rounded p-3 disabled:opacity-40"
            disabled={confirmation !== CONFIRMATION || generating}
            onClick={generate}
          >
            {generating
              ? "Start wird vorbereitet …"
              : "Kostenpflichtig generieren"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
