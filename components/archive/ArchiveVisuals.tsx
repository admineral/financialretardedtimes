"use client";
import { useMemo, useState } from "react";
import type {
  ArchiveCoverage,
  ArchiveMessage,
  BtcHistory,
} from "@/lib/archive/types";
export function ActivityCalendar({
  coverage,
  from,
  to,
  onSelect,
}: {
  coverage: ArchiveCoverage;
  from?: string;
  to?: string;
  onSelect: (date: string) => void;
}) {
  const years = [
    ...new Set(coverage.days.map((day) => day.date.slice(0, 4))),
  ].reverse();
  const [selectedYear, setYear] = useState("");
  const year = years.includes(selectedYear)
    ? selectedYear
    : (years[0] ?? String(new Date().getFullYear()));
  const counts = useMemo(
    () => new Map(coverage.days.map((day) => [day.date, day.count])),
    [coverage.days],
  );
  const max = Math.max(1, ...coverage.days.map((day) => day.count));
  const first = new Date(`${year}-01-01T12:00:00Z`),
    dates: string[] = [];
  for (
    const date = new Date(first);
    date.getUTCFullYear() === Number(year);
    date.setUTCDate(date.getUTCDate() + 1)
  )
    dates.push(date.toISOString().slice(0, 10));
  return (
    <section className="aw-panel">
      <div className="aw-panel-head">
        <div>
          <div className="aw-section-label">Der gespeicherte Verlauf</div>
          <h2>Aktivität im Archiv</h2>
        </div>
        <label className="aw-field">
          Jahr
          <select
            className="aw-input aw-small-select"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="aw-calendar-scroll">
        <div
          className="aw-calendar"
          aria-label={`Gespeicherte Nachrichten ${year}`}
        >
          {Array.from({ length: (first.getUTCDay() + 6) % 7 }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {dates.map((date) => {
            const count = counts.get(date) ?? 0,
              level = count
                ? Math.min(
                    4,
                    Math.max(1, Math.ceil(Math.sqrt(count / max) * 4)),
                  )
                : 0;
            return (
              <button
                type="button"
                key={date}
                className="aw-day"
                data-level={level}
                title={`${date}: ${count ? `${count} gespeicherte Nachrichten` : "Keine gespeicherten Nachrichten · Abdeckung unbekannt"}`}
                aria-label={`${date}: ${count} gespeichert`}
                aria-pressed={Boolean(from && to && date >= from && date <= to)}
                onClick={() => onSelect(date)}
              />
            );
          })}
        </div>
      </div>
      <div className="aw-legend">
        <span>
          Ein Tag pro Feld. Graue Tage: keine Nachrichten gespeichert.
        </span>
        <span className="aw-legend-scale">
          Weniger{" "}
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className="aw-day" data-level={i} />
          ))}{" "}
          Mehr
        </span>
      </div>
    </section>
  );
}
export function BtcChart({ history }: { history: BtcHistory | null }) {
  const candles = history?.candles ?? [];
  const sampled = candles.filter(
    (_, i) => i % Math.max(1, Math.floor(candles.length / 400)) === 0,
  );
  if (!sampled.length)
    return (
      <p className="aw-note">
        Für diesen Zeitraum sind keine BTC-Kurse verfügbar.
      </p>
    );
  const values = sampled.map((c) => c.close),
    min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (v, i) =>
        `${((i / Math.max(1, values.length - 1)) * 1000).toFixed(1)},${(125 - ((v - min) / (max - min || 1)) * 105).toFixed(1)}`,
    )
    .join(" ");
  return (
    <div>
      <svg
        className="aw-chart"
        viewBox="0 0 1000 150"
        preserveAspectRatio="none"
        role="img"
        aria-label={`BTC/USDT von ${Math.round(min)} bis ${Math.round(max)}`}
      >
        <line x1="0" x2="1000" y1="125" y2="125" stroke="var(--aw-rule)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--aw-accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="aw-chart-labels">
        <span>{sampled[0].openTime.slice(0, 10)}</span>
        <span>
          {Math.round(min).toLocaleString("de-DE")} –{" "}
          {Math.round(max).toLocaleString("de-DE")} USDT
        </span>
        <span>{sampled.at(-1)!.openTime.slice(0, 10)}</span>
      </div>
      {history?.notes.map((note) => (
        <p className="aw-note" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
}
export function Transcript({ messages }: { messages: ArchiveMessage[] }) {
  return (
    <div>
      {messages.map((message) => (
        <article className="aw-message" key={message.id}>
          <div className="aw-avatar" aria-hidden>
            {message.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <header>
              <strong>{message.username}</strong>
              <time dateTime={message.timestamp ?? undefined}>
                {message.timestamp
                  ? new Date(message.timestamp).toLocaleString("de-DE", {
                      timeZone: "Europe/Berlin",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : `${message.date ?? "Datum unbekannt"} · Uhrzeit unbekannt`}
              </time>
            </header>
            <p>{message.text}</p>
            <small>
              {message.sources
                .map((s) =>
                  s.table === "tv_chat_messages"
                    ? "Raumarchiv"
                    : "Profilarchiv",
                )
                .filter((x, i, a) => a.indexOf(x) === i)
                .join(" + ")}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}
