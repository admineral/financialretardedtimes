"use client";
import { useState } from "react";
import { Transcript } from "@/components/archive/ArchiveVisuals";
import type { ArchiveMessage } from "@/lib/archive/types";
export function Comparison({
  room,
  from,
  to,
}: {
  room: string;
  from: string;
  to: string;
}) {
  const [messages, setMessages] = useState<ArchiveMessage[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [snapshot, setSnapshot] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({ room, from, to });
      if (cursor) p.set("cursor", cursor);
      if (snapshot) p.set("snapshot", snapshot);
      const response = await fetch(`/api/archive/messages?${p}`);
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setMessages(data.messages);
      setCursor(data.nextCursor);
      setSnapshot(data.fingerprint);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="aw-panel" style={{ marginTop: 24 }}>
      <div className="aw-panel-head">
        <h2>Was tatsächlich gesagt wurde</h2>
        <span className="aw-tag" style={{ margin: 0 }}>
          ECHTES ARCHIV
        </span>
      </div>
      <p className="aw-note">
        Diese Nachrichten waren nicht Teil der Modelleingabe. Der Vergleich ist
        ein historisches Experiment, kein Beweis für Vorhersagequalität.
      </p>
      {error && (
        <p role="alert" className="aw-error">
          {error}
        </p>
      )}
      {messages && <Transcript messages={messages} />}{" "}
      {messages?.length === 0 && (
        <p className="aw-empty">
          Keine Nachrichten für diese Replay-Woche gespeichert.
        </p>
      )}
      {(!messages || cursor) && (
        <button
          className="aw-button"
          style={{ marginTop: 18 }}
          disabled={busy}
          onClick={load}
        >
          {busy
            ? "Wird geladen …"
            : messages
              ? "Nächste Nachrichten"
              : "Echte Nachrichten zum Vergleich öffnen"}
        </button>
      )}
    </section>
  );
}
