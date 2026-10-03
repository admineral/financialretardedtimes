"use client";
import { useState } from "react";
import { SECTIONS, type Issue } from "@/lib/newspaper-v4/schema";
import type { EditionOutput } from "@/lib/newspaper-v4/generate";
import { HORIZONS, type Horizon } from "@/lib/newspaper-v4/config";
import { MarketStage } from "./MarketStage";
import { hue, longDate, pct, price, stamp, STANCE } from "./format";

function Mood({ mood }: { mood: Issue["mood"] }) {
  // Semicircle gauge: -100 (left, panic) to +100 (right, euphoria).
  const angle = ((mood.score + 100) / 200) * Math.PI;
  const nx = 100 - 78 * Math.cos(angle),
    ny = 100 - 78 * Math.sin(angle);
  return (
    <div className="v4-card v4-mood">
      <span className="v4-label">Stimmungsbarometer</span>
      <svg viewBox="0 0 200 112" aria-hidden="true">
        <path d="M14 100 A86 86 0 0 1 186 100" className="v4-gauge-track" />
        <path d="M14 100 A86 86 0 0 1 186 100" className="v4-gauge" pathLength={100} strokeDasharray={`${(mood.score + 100) / 2} 100`} />
        <line x1="100" y1="100" x2={nx} y2={ny} className="v4-needle" />
        <circle cx="100" cy="100" r="6" className="v4-needle-dot" />
      </svg>
      <div className="v4-mood-scale">
        <span>Panik</span>
        <strong>
          {mood.score > 0 ? "+" : ""}
          {mood.score} · {mood.label}
        </strong>
        <span>Euphorie</span>
      </div>
      <p>{mood.explanation}</p>
    </div>
  );
}

function Paragraphs({ text, drop }: { text: string; drop?: boolean }) {
  return text
    .split(/\n+/)
    .filter(Boolean)
    .map((p, i) => (
      <p key={i} className={drop && i === 0 ? "v4-drop" : undefined}>
        {p}
      </p>
    ));
}

export function EditionView({
  output,
  meta,
}: {
  output: EditionOutput;
  meta: {
    number: number;
    createdAt: string;
    horizon: Horizon;
    start: string;
    end: string;
    voiceFrom: string;
    voiceTo: string;
    messageCount: number;
    model: string;
  };
}) {
  const { issue, candles, stats, evidence } = output;
  const [section, setSection] = useState<string | null>(null),
    [open, setOpen] = useState<string | null>(null);
  const sections = SECTIONS.filter((s) => issue.articles.some((a) => a.section === s));
  const articles = issue.articles.filter((a) => !section || a.section === section);
  const lastClose = candles.at(-1)?.close ?? stats.close;

  return (
    <article className="v4-paper">
      <div className="v4-ticker" aria-label="Eilmeldungen">
        <span className="v4-ticker-label">EIL</span>
        <div className="v4-ticker-track">
          <div>
            {[...issue.ticker, ...issue.ticker].map((t, i) => (
              <span key={i} aria-hidden={i >= issue.ticker.length || undefined}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <header className="v4-masthead">
        <div className="v4-mast-meta">
          <span>Nr. {meta.number} · KI-Ausgabe</span>
          <span>{longDate(meta.createdAt)}</span>
          <span>{HORIZONS[meta.horizon].long}</span>
        </div>
        <h1 className="v4-title">Financial Retarded Times</h1>
        <div className="v4-mast-sub">
          <span>Die Stimme des Krypto-Chats — weitergeträumt von einer Maschine</span>
          <span className={stats.changePct >= 0 ? "v4-up" : "v4-down"}>
            BTC {price(lastClose)} · {pct(stats.changePct)}
          </span>
        </div>
      </header>
      <p className="v4-fiction">
        <b>Fiktion.</b> Kurse echt, Stimmen erfunden: Diese Ausgabe hat eine KI aus dem
        Tonfall des Chats ({meta.voiceFrom} – {meta.voiceTo}) und dem echten BTC-Verlauf
        geschrieben. Niemand hier hat das wirklich gesagt. Kein Finanzrat.
      </p>

      <section className="v4-hero">
        <div>
          <span className="v4-kicker">{issue.kicker}</span>
          <h2 className="v4-headline">{issue.headline}</h2>
          <p className="v4-deck">{issue.deck}</p>
        </div>
        <div className="v4-hero-side">
          <Mood mood={issue.mood} />
          <dl className="v4-card v4-stats">
            <div><dt>Eröffnung</dt><dd>{price(stats.open)}</dd></div>
            <div><dt>Aktuell</dt><dd>{price(stats.close)}</dd></div>
            <div><dt>Hoch</dt><dd className="v4-up">{price(stats.high.price)}</dd></div>
            <div><dt>Tief</dt><dd className="v4-down">{price(stats.low.price)}</dd></div>
          </dl>
        </div>
      </section>

      <MarketStage candles={candles} chat={issue.chat} moments={issue.moments} />

      <section className="v4-lead">
        <span className="v4-section-tag">Aufmacher</span>
        <h2>{issue.lead.title}</h2>
        <div className="v4-columns">
          <Paragraphs text={issue.lead.body} drop />
        </div>
        <blockquote className="v4-pull">
          „{issue.lead.pullQuote.text}“
          <cite>— {issue.lead.pullQuote.username}, sinngemäß, frei erfunden</cite>
        </blockquote>
      </section>

      <section className="v4-block">
        <div className="v4-block-head">
          <h2>Aus den Ressorts</h2>
          <div className="v4-chips" role="group" aria-label="Ressort filtern">
            <button type="button" aria-pressed={!section} onClick={() => setSection(null)}>Alle</button>
            {sections.map((s) => (
              <button key={s} type="button" aria-pressed={section === s} onClick={() => setSection(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="v4-articles">
          {articles.map((a, i) => (
            <article key={a.title + i} className="v4-article">
              <span className="v4-section-tag">{a.section}</span>
              <h3>{a.title}</h3>
              <Paragraphs text={a.body} />
              <footer>Von {a.author}</footer>
            </article>
          ))}
        </div>
      </section>

      <section className="v4-block">
        <div className="v4-block-head">
          <h2>Die Besetzung</h2>
          <span className="v4-label">Klick zeigt echte Belege aus dem Chat</span>
        </div>
        <div className="v4-cast">
          {issue.cast.map((c) => {
            const cites = evidence.filter((e) => c.sourceIds.includes(e.id));
            const expanded = open === c.username;
            return (
              <article key={c.username} className={`v4-person v4-s-${c.stance}`}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.username)}>
                  <span className="v4-avatar v4-avatar-lg" style={{ "--h": hue(c.username) } as React.CSSProperties}>
                    {c.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{c.username}</strong>
                    <em>{c.role}</em>
                  </span>
                  <span className={`v4-pill v4-s-${c.stance}`}>{STANCE[c.stance]}</span>
                </button>
                <p>{c.bio}</p>
                {expanded && (
                  <div className="v4-evidence">
                    <span className="v4-label">Echte Nachrichten (Stilvorlage)</span>
                    {cites.length ? (
                      cites.map((e) => (
                        <blockquote key={e.id}>
                          {e.text}
                          {e.timestamp && <small>{stamp(e.timestamp)}</small>}
                        </blockquote>
                      ))
                    ) : (
                      <p>Keine Belege angegeben.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="v4-bottom">
        {issue.predictions.length > 0 && (
          <section className="v4-block">
            <div className="v4-block-head">
              <h2>Tippspiel</h2>
              <span className="v4-label">vs. aktueller Kurs {price(lastClose)}</span>
            </div>
            <ul className="v4-tips">
              {issue.predictions.map((p, i) => {
                const gap = p.target ? ((p.target - lastClose) / lastClose) * 100 : null;
                return (
                  <li key={i}>
                    <strong>{p.username}</strong>
                    <p>{p.call}</p>
                    {p.target && gap !== null && (
                      <div className="v4-tip-bar">
                        <span>{price(p.target)}</span>
                        <span className={gap >= 0 ? "v4-up" : "v4-down"}>{pct(gap)}</span>
                        <i style={{ "--w": `${Math.min(100, Math.abs(gap) * 5)}%` } as React.CSSProperties} className={gap >= 0 ? "v4-bar-up" : "v4-bar-down"} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {issue.briefs.length > 0 && (
          <section className="v4-block v4-briefs">
            <div className="v4-block-head">
              <h2>Kurz notiert</h2>
            </div>
            <ul>
              {issue.briefs.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="v4-colophon">
        Ausgabezeitraum {stamp(meta.start)} – {stamp(meta.end)} · Stilvorlage{" "}
        {meta.messageCount} echte Nachrichten ({meta.voiceFrom} – {meta.voiceTo}) · Modell{" "}
        {meta.model} · Kurse: Binance BTC/USDT
      </footer>
    </article>
  );
}
