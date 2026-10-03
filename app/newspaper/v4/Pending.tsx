"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LINES = [
  "Lese den Chat der letzten Tage …",
  "Lege die Kerzen auf den Leuchttisch …",
  "Verteile Rollen: Bulle, Bär, Meme-Lord …",
  "Setze die Schlagzeile …",
  "Druckerpresse läuft warm …",
];
export function Pending({ id }: { id: string }) {
  const router = useRouter();
  const [line, setLine] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 3500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/newspaper-v4/editions/${id}`, {
          signal: abort.signal,
        });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (data.status !== "running") return router.refresh();
        setError("");
      } catch {
        if (!stopped) setError("Verbindung unterbrochen, versuche es weiter …");
      }
      if (!stopped) timer = setTimeout(poll, 4000);
    }
    void poll();
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [id, router]);
  return (
    <div className="v4-pending" role="status">
      <div className="v4-press" aria-hidden="true">
        <span /><span /><span />
      </div>
      <h2>Die Ausgabe ist im Druck.</h2>
      <p>{LINES[line]}</p>
      <small>
        Das dauert meist 1–3 Minuten. Du kannst die Seite verlassen und später
        über dieselbe Adresse zurückkommen.
      </small>
      {error && <small>{error}</small>}
    </div>
  );
}
