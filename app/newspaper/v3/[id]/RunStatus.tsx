"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function RunStatus({ id }: { id: string }) {
  const router = useRouter(),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/newspaper-v3/runs/${id}`, {
          signal: abort.signal,
        });
        if (!response.ok) throw Error("Status momentan nicht erreichbar.");
        const data = await response.json();
        if (data.status !== "running") {
          router.refresh();
          return;
        }
        setError("");
      } catch {
        if (!stopped)
          setError("Verbindung unterbrochen. Der Status wird erneut geprüft.");
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
    <div className="aw-panel">
      <div className="aw-loading" role="status">
        Die experimentelle Ausgabe wird geschrieben …
      </div>
      <p className="aw-note">
        Du kannst diese Seite verlassen und später über dieselbe Adresse
        zurückkehren. Ein Lauf endet spätestens nach fünf Minuten.
      </p>
      {error && (
        <p role="status" className="aw-note">
          {error}
        </p>
      )}
    </div>
  );
}
