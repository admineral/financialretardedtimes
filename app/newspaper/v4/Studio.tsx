"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Search, SlidersHorizontal } from "lucide-react";
import { HORIZONS, V4_CONFIG, type Horizon } from "@/lib/newspaper-v4/config";
import type { EditionInput } from "@/lib/newspaper-v4/schema";
import type { EditionPreview } from "@/lib/newspaper-v4/prepare";
import { price, stamp } from "./format";

export function Studio({
  defaults,
  startOpen,
}: {
  defaults: EditionInput;
  startOpen: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState(defaults),
    [preview, setPreview] = useState<EditionPreview | null>(null),
    [busy, setBusy] = useState<"check" | "print" | null>(null),
    [error, setError] = useState("");
  function change(next: Partial<EditionInput>) {
    setInput((i) => ({ ...i, ...next }));
    setPreview(null);
    setError("");
  }
  async function call(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error ?? "Unbekannter Fehler");
    return data;
  }
  async function check() {
    setBusy("check");
    setError("");
    try {
      setPreview(await call("/api/newspaper-v4/preview", input));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function print() {
    setBusy("print");
    setError("");
    try {
      const data = await call("/api/newspaper-v4/editions", { input, confirmed: true });
      router.push(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  return (
    <details className="v4-studio" open={startOpen}>
      <summary>
        <SlidersHorizontal size={16} /> Neue KI-Ausgabe drucken
        <small>
          {HORIZONS[input.horizon].label} · {input.voiceDays} Tage Chat-Stil
        </small>
      </summary>
      <div className="v4-studio-body">
        <fieldset>
          <legend>Ausgabezeitraum (echte BTC-Kurse)</legend>
          <div className="v4-seg v4-seg-lg" role="group">
            {(Object.keys(HORIZONS) as Horizon[]).map((h) => (
              <button key={h} type="button" aria-pressed={input.horizon === h} onClick={() => change({ horizon: h })}>
                {HORIZONS[h].label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Chat-Stil lernen aus <b>{input.voiceDays} Tagen</b>
          </legend>
          <input
            type="range"
            min={1}
            max={V4_CONFIG.maxVoiceDays}
            value={input.voiceDays}
            onChange={(e) => change({ voiceDays: +e.target.value })}
            aria-label="Tage Chatverlauf"
          />
          <div className="v4-seg" role="group" aria-label="Voreinstellungen">
            {V4_CONFIG.voiceDayPresets.map((d) => (
              <button key={d} type="button" aria-pressed={input.voiceDays === d} onClick={() => change({ voiceDays: d })}>
                {d} T
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <label className="v4-switch">
            <input type="checkbox" checked={input.blind} onChange={(e) => change({ blind: e.target.checked })} />
            <span>
              <b>Blindflug</b> — die KI sieht keine echten Nachrichten aus dem Ausgabezeitraum
              und muss den Chat komplett erfinden.
            </span>
          </label>
        </fieldset>
        <div className="v4-studio-actions">
          <button type="button" className="v4-btn" onClick={check} disabled={!!busy}>
            <Search size={15} /> {busy === "check" ? "Prüfe …" : "Daten prüfen"}
          </button>
          {preview?.canGenerate && (
            <button type="button" className="v4-btn v4-btn-primary" onClick={print} disabled={!!busy}>
              <Printer size={15} /> {busy === "print" ? "Starte Druck …" : `Ausgabe drucken (~${preview.estimatedUSD.toFixed(2)} $)`}
            </button>
          )}
        </div>
        {error && <p className="v4-error" role="alert">{error}</p>}
        {preview && (
          <dl className="v4-preview">
            <div><dt>Ausgabe</dt><dd>{stamp(preview.start)} – {stamp(preview.end)}</dd></div>
            <div><dt>Chat-Stil</dt><dd>{preview.voiceFrom} – {preview.voiceTo}</dd></div>
            <div><dt>Nachrichten</dt><dd>{preview.messageCount} von {preview.participantCount} Leuten</dd></div>
            <div><dt>Kerzen</dt><dd>{preview.candleCount} h{preview.lastPrice ? ` · zuletzt ${price(preview.lastPrice)}` : ""}</dd></div>
            <div><dt>Prompt</dt><dd>{preview.inputTokens.toLocaleString("de-DE")} Tokens · {preview.model}</dd></div>
            <div><dt>Stimmen</dt><dd>{preview.topVoices.map((v) => v.username).join(", ") || "–"}</dd></div>
            {preview.problems.map((p) => (
              <p key={p} className="v4-error">{p}</p>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}
