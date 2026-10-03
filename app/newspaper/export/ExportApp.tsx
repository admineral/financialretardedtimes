"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Copy,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import {
  ActivityCalendar,
  BtcChart,
  Transcript,
} from "@/components/archive/ArchiveVisuals";
import type {
  ArchiveMessage,
  ArchiveOverview,
  BtcHistory,
} from "@/lib/archive/types";
import { addDaysToDateKey } from "../lib/timezone";
async function readJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  return data;
}
export function ExportApp() {
  const search = useSearchParams();
  const [room, setRoom] = useState(search.get("room") ?? "bitcoin_de_DE"),
    [username, setUsername] = useState(search.get("username") ?? "");
  const [from, setFrom] = useState(search.get("from") ?? ""),
    [to, setTo] = useState(search.get("to") ?? ""),
    [btc, setBtc] = useState(true);
  const [query, setQuery] = useState(() =>
    new URLSearchParams({
      room,
      ...(username ? { username } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }).toString(),
  );
  const [overview, setOverview] = useState<ArchiveOverview | null>(null),
    [messages, setMessages] = useState<ArchiveMessage[]>([]),
    [prices, setPrices] = useState<BtcHistory | null>(null);
  const [cursor, setCursor] = useState<string | null>(null),
    [snapshot, setSnapshot] = useState(""),
    [loading, setLoading] = useState(true),
    [paging, setPaging] = useState(false),
    [priceLoading, setPriceLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false),
    [copying, setCopying] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    requestVersion.current++;
    setLoading(true);
    setOverview(null);
    setMessages([]);
    setPrices(null);
    setError("");
    setNotice("");
    setPaging(false);
    Promise.all([
      readJSON<ArchiveOverview>(
        `/api/archive/overview?${query}`,
        abort.signal,
      ).then((meta) => {
        if (!abort.signal.aborted) setOverview(meta);
        return meta;
      }),
      readJSON<{
        messages: ArchiveMessage[];
        nextCursor: string | null;
        fingerprint: string;
      }>(`/api/archive/messages?${query}`, abort.signal),
    ])
      .then(([meta, page]) => {
        setOverview(meta);
        setMessages(page.messages);
        setCursor(page.nextCursor);
        setSnapshot(page.fingerprint);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [query]);
  useEffect(() => {
    if (!overview || !btc) return;
    const abort = new AbortController();
    setPriceLoading(true);
    readJSON<BtcHistory | null>(`/api/archive/prices?${query}`, abort.signal)
      .then(setPrices)
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice(
            "BTC-Daten sind derzeit nicht verfügbar. Chat-Export bleibt möglich.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setPriceLoading(false);
      });
    return () => abort.abort();
  }, [overview, query, btc]);
  function apply(nextFrom = from, nextTo = to) {
    const params = new URLSearchParams({ room });
    if (username.trim()) params.set("username", username.trim());
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    const next = params.toString();
    setQuery(next);
    window.history.replaceState(null, "", `/newspaper/export?${next}`);
  }
  function preset(days: number | null) {
    const end = overview?.available.lastDate ?? "";
    const start = days && end ? addDaysToDateKey(end, 1 - days) : "";
    setFrom(start);
    setTo(days ? end : "");
    apply(start, days ? end : "");
  }
  async function nextPage() {
    const version = requestVersion.current;
    setPaging(true);
    try {
      const page = await readJSON<{
        messages: ArchiveMessage[];
        nextCursor: string | null;
      }>(
        `/api/archive/messages?${query}&cursor=${encodeURIComponent(cursor!)}&snapshot=${snapshot}`,
      );
      if (version === requestVersion.current) {
        setMessages(page.messages);
        setCursor(page.nextCursor);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaging(false);
    }
  }
  const download = (format: string) =>
    `/api/archive/export?${query}&btc=${btc}&format=${format}`;
  async function copyJson() {
    setCopying(true);
    setNotice("");
    try {
      const response = await fetch(download("json"));
      if (!response.ok) throw new Error((await response.json()).error);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice(
        "Kopieren war nicht möglich. Bitte JSON herunterladen oder die Zwischenablage im Browser erlauben.",
      );
    } finally {
      setCopying(false);
    }
  }
  const active = useMemo(() => new URLSearchParams(query), [query]),
    selected = overview?.selected;
  return (
    <>
      <div className="aw-intro">
        <div>
          <div className="aw-eyebrow">
            <span className="aw-dot" /> Das Gedächtnis der Community
          </div>
          <h1 className="aw-title">Die Gespräche bleiben.</h1>
          <p>
            Ein gemeinsames Archiv. Alle Stimmen, ihre Zeit und der Bitcoin-Kurs
            dazu. Durchstöbern, eingrenzen und für deine eigenen Experimente
            mitnehmen.
          </p>
        </div>
        <span className="aw-tag">ARCHIVE / 01</span>
      </div>
      <div className="aw-stats" aria-live="polite">
        <div className="aw-stat">
          <strong>
            {selected?.messageCount.toLocaleString("de-DE") ?? "—"}
          </strong>
          <small>Nachrichten ausgewählt</small>
        </div>
        <div className="aw-stat">
          <strong>{selected?.participantCount ?? "—"}</strong>
          <small>Stimmen im Archiv</small>
        </div>
        <div className="aw-stat">
          <strong>{selected?.firstDate ?? "—"}</strong>
          <small>Erste gespeicherte Nachricht</small>
        </div>
        <div className="aw-stat">
          <strong>{selected?.lastDate ?? "—"}</strong>
          <small>Letzte gespeicherte Nachricht</small>
        </div>
      </div>
      {error && (
        <div className="aw-error" role="alert">
          {error}
        </div>
      )}
      <div className="aw-grid">
        <aside className="aw-panel aw-sidebar">
          <div className="aw-panel-head">
            <h2>Dein Ausschnitt</h2>
            <SlidersHorizontal size={16} />
          </div>
          <form
            className="aw-form"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <label className="aw-field">
              Chatraum
              <select
                className="aw-input"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                {[
                  ...new Set(["bitcoin_de_DE", ...(overview?.rooms ?? [])]),
                ].map((r) => (
                  <option key={r} value={r}>
                    {r === "bitcoin_de_DE" ? "Bitcoin · Deutsch" : r}
                  </option>
                ))}
              </select>
            </label>
            <label className="aw-field">
              Teilnehmer · optional
              <input
                className="aw-input"
                placeholder="Alle Stimmen"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                list="archive-users"
              />
              <datalist id="archive-users">
                {overview?.available.participants.map((p) => (
                  <option key={p.username} value={p.username} />
                ))}
              </datalist>
            </label>
            <div className="aw-range-buttons">
              <button
                type="button"
                aria-pressed={!from && !to}
                onClick={() => preset(null)}
              >
                Alles
              </button>
              <button type="button" onClick={() => preset(30)}>
                30 Tage
              </button>
              <button type="button" onClick={() => preset(183)}>
                6 Monate
              </button>
            </div>
            <label className="aw-field">
              Von
              <input
                aria-label="Von"
                className="aw-input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="aw-field">
              Bis
              <input
                aria-label="Bis"
                className="aw-input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="aw-button" disabled={loading}>
              Auswahl anwenden
            </button>
          </form>
          <div className="aw-divider" />
          <div className="aw-section-label">Mitnehmen & weiterdenken</div>
          <label className="aw-checkbox" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={btc}
              onChange={(e) => setBtc(e.target.checked)}
            />
            <span>
              Bitcoin-Kurse einschließen
              <br />
              <span className="aw-note">Stündliche BTC/USDT-Kerzen</span>
            </span>
          </label>
          <div className="aw-downloads">
            {overview && !loading ? (
              <>
                <a
                  className="aw-button aw-button-primary"
                  href={download("json")}
                >
                  JSON herunterladen <ArrowDownToLine size={15} />
                </a>
                <button
                  className="aw-button"
                  onClick={copyJson}
                  disabled={copying}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                  {copying
                    ? "JSON wird vorbereitet …"
                    : copied
                      ? "Kopiert"
                      : "JSON kopieren"}
                </button>
              </>
            ) : (
              <p className="aw-note">
                Downloads erscheinen, sobald das Archiv vollständig gelesen
                wurde.
              </p>
            )}
          </div>
          <p className="aw-note" style={{ marginTop: 14 }}>
            JSON bewahrt Originaltext, Zeitstempel und Quellen und ist direkt
            für KI-Analysen nutzbar. Große Dateien werden auf dem Server
            vorbereitet.
          </p>
          {notice && (
            <p role="status" className="aw-note" style={{ marginTop: 12 }}>
              {notice}
            </p>
          )}
          <div className="aw-divider" />
          <Link
            className="aw-inline"
            style={{ fontSize: 12, color: "var(--aw-accent)", marginBottom: 8 }}
            href={
              username.trim()
                ? `/newspaper/people?username=${encodeURIComponent(username.trim())}`
                : "/newspaper/people"
            }
          >
            Eine Person: Netzwerk & KI-Export <ArrowUpRight size={14} />
          </Link>
          <Link
            className="aw-inline"
            style={{ fontSize: 12, color: "var(--aw-accent)" }}
            href="/newspaper/v3"
          >
            Was wäre danach passiert? <ArrowUpRight size={14} />
          </Link>
        </aside>
        <div className="aw-content">
          {loading && !overview ? (
            <div className="aw-panel aw-loading" role="status">
              Beide Archive werden vollständig eingelesen …
            </div>
          ) : overview ? (
            <>
              <ActivityCalendar
                coverage={overview.available}
                from={active.get("from") ?? undefined}
                to={active.get("to") ?? undefined}
                onSelect={(date) => {
                  setFrom(date);
                  setTo(date);
                  apply(date, date);
                }}
              />
              {btc && (
                <section className="aw-panel">
                  <div className="aw-panel-head">
                    <div>
                      <div className="aw-section-label">
                        Der Markt im selben Zeitraum
                      </div>
                      <h2>Bitcoin, im Kontext.</h2>
                    </div>
                    <span className="aw-count">BTC / USDT</span>
                  </div>
                  {priceLoading ? (
                    <div className="aw-loading">
                      Historische Kurse werden geladen …
                    </div>
                  ) : (
                    <BtcChart history={prices} />
                  )}
                </section>
              )}
              <section className="aw-panel">
                <div className="aw-panel-head">
                  <div>
                    <div className="aw-section-label">
                      Unverändert aus dem Archiv
                    </div>
                    <h2>Die Unterhaltung</h2>
                  </div>
                  <span className="aw-count">
                    {messages.length} von{" "}
                    {selected?.messageCount.toLocaleString("de-DE")}
                  </span>
                </div>
                <p className="aw-note">
                  Vorschau in chronologischer Reihenfolge · Europe/Berlin.
                  Downloads enthalten die gesamte Auswahl.
                </p>
                {loading ? (
                  <div className="aw-loading">Nachrichten werden geladen …</div>
                ) : messages.length ? (
                  <Transcript messages={messages} />
                ) : (
                  <div className="aw-empty">
                    Keine gespeicherten Nachrichten in dieser Auswahl.
                  </div>
                )}
                {cursor && (
                  <button
                    className="aw-button"
                    onClick={nextPage}
                    disabled={paging}
                  >
                    {paging ? "Wird geladen …" : "Nächste 50 Nachrichten"}
                  </button>
                )}
              </section>
              <p className="aw-note">
                Raum- und Profilarchiv zusammengeführt.{" "}
                {overview.available.duplicateCount.toLocaleString("de-DE")}{" "}
                bestätigte Duplikate zusammengeführt.{" "}
                {overview.available.conflictCount} abweichende Datensätze
                bleiben erhalten. Leere Tage bedeuten unbekannte Abdeckung,
                nicht zwingend einen stillen Chat.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
