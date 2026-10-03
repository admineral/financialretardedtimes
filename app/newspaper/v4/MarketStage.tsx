"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { BtcCandle } from "@/lib/archive/types";
import type { Issue } from "@/lib/newspaper-v4/schema";
import { hue, pct, price, stamp, STANCE, time } from "./format";

const W = 1000,
  H = 340,
  PAD = { top: 28, right: 64, bottom: 30, left: 12 };
const SPEEDS = [
  { label: "1×", ms: 220 },
  { label: "3×", ms: 70 },
  { label: "10×", ms: 20 },
];

export function MarketStage({
  candles,
  chat,
  moments,
}: {
  candles: BtcCandle[];
  chat: Issue["chat"];
  moments: Issue["moments"];
}) {
  const last = candles.length - 1;
  const [cursor, setCursor] = useState(last),
    [hover, setHover] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(0);
  const feed = useRef<HTMLOListElement>(null);

  const geo = useMemo(() => {
    const lows = candles.map((c) => c.low),
      highs = candles.map((c) => c.high);
    const min = Math.min(...lows),
      max = Math.max(...highs),
      span = max - min || 1;
    const x = (i: number) =>
      PAD.left + (i / Math.max(1, last)) * (W - PAD.left - PAD.right);
    const y = (p: number) =>
      PAD.top + (1 - (p - min) / span) * (H - PAD.top - PAD.bottom);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * span);
    const at = (iso: string) => {
      const t = Date.parse(iso);
      let best = 0;
      candles.forEach((c, i) => {
        if (Date.parse(c.openTime) <= t) best = i;
      });
      return best;
    };
    return { x, y, ticks, at };
  }, [candles, last]);

  const path = (upto: number) =>
    candles
      .slice(0, upto + 1)
      .map((c, i) => `${i ? "L" : "M"}${geo.x(i).toFixed(1)},${geo.y(c.close).toFixed(1)}`)
      .join("");
  const line = path(cursor);
  const area = `${line}L${geo.x(cursor)},${H - PAD.bottom}L${geo.x(0)},${H - PAD.bottom}Z`;
  const now = candles[cursor];
  const visible = chat.filter(
    (m) => Date.parse(m.timestamp) <= Date.parse(now.closeTime),
  );
  const change = ((now.close - candles[0].open) / candles[0].open) * 100;

  useEffect(() => {
    if (!playing) return;
    if (cursor >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].ms);
    return () => clearTimeout(timer);
  }, [playing, speed, cursor, last]);

  useEffect(() => {
    const el = feed.current;
    if (el && playing) el.scrollTop = el.scrollHeight;
  }, [visible.length, playing]);

  function toggle() {
    if (!playing && cursor >= last) setCursor(0);
    setPlaying((p) => !p);
  }
  function pick(event: React.MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fx = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((fx - PAD.left) / (W - PAD.left - PAD.right)) * last);
    return Math.min(last, Math.max(0, i));
  }
  const tip = hover ?? null;

  return (
    <section className="v4-stage" aria-label="Kursverlauf und simulierter Chat">
      <div className="v4-stage-chart">
        <header className="v4-stage-head">
          <div>
            <span className="v4-label">BTC/USDT · Binance · stündlich</span>
            <strong className="v4-stage-price">{price(now.close)}</strong>
            <span className={change >= 0 ? "v4-up" : "v4-down"}>{pct(change)}</span>
          </div>
          <span className="v4-stage-time">{stamp(now.closeTime)}</span>
        </header>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="v4-chart"
          role="img"
          aria-label="BTC-Kurs im Ausgabezeitraum"
          onPointerMove={(e) => setHover(pick(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            setPlaying(false);
            setCursor(pick(e));
          }}
        >
          <defs>
            <linearGradient id="v4-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--v4-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--v4-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="v4-grid" />
              <text x={W - PAD.right + 8} y={geo.y(t) + 4} className="v4-axis">
                {Math.round(t / 100) / 10}k
              </text>
            </g>
          ))}
          <path d={path(last)} className="v4-ghost" />
          <path d={area} fill="url(#v4-fill)" />
          <path d={line} className="v4-line" />
          {chat.map((m, i) => {
            const idx = geo.at(m.timestamp);
            return (
              <circle
                key={i}
                cx={geo.x(idx)}
                cy={H - PAD.bottom + 12}
                r={3.2}
                className={`v4-tick v4-s-${m.stance}`}
                opacity={idx <= cursor ? 1 : 0.25}
              />
            );
          })}
          {moments.map((m, i) => {
            const idx = geo.at(m.timestamp);
            return (
              <g
                key={i}
                className="v4-moment"
                opacity={idx <= cursor ? 1 : 0.35}
                onClick={(e) => {
                  e.stopPropagation();
                  setPlaying(false);
                  setCursor(idx);
                }}
              >
                <line x1={geo.x(idx)} x2={geo.x(idx)} y1={14} y2={geo.y(candles[idx].close)} />
                <circle cx={geo.x(idx)} cy={14} r={11} />
                <text x={geo.x(idx)} y={18}>{i + 1}</text>
              </g>
            );
          })}
          <circle cx={geo.x(cursor)} cy={geo.y(now.close)} r={5} className="v4-head" />
          {tip !== null && (
            <g className="v4-hover">
              <line x1={geo.x(tip)} x2={geo.x(tip)} y1={PAD.top} y2={H - PAD.bottom} />
              <text
                x={Math.min(geo.x(tip) + 8, W - 210)}
                y={PAD.top + 14}
              >
                {stamp(candles[tip].closeTime)} · {price(candles[tip].close)}
              </text>
            </g>
          )}
        </svg>
        <div className="v4-controls">
          <button type="button" className="v4-play" onClick={toggle}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {playing ? "Pause" : cursor >= last ? "Zeitraum abspielen" : "Weiter"}
          </button>
          <input
            type="range"
            min={0}
            max={last}
            value={cursor}
            aria-label="Zeitpunkt"
            onChange={(e) => {
              setPlaying(false);
              setCursor(+e.target.value);
            }}
          />
          <div className="v4-seg" role="group" aria-label="Tempo">
            {SPEEDS.map((s, i) => (
              <button key={s.label} type="button" aria-pressed={speed === i} onClick={() => setSpeed(i)}>
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="v4-icon" onClick={() => { setPlaying(false); setCursor(last); }} aria-label="Alles zeigen">
            <RotateCcw size={15} />
          </button>
        </div>
        <ol className="v4-moments">
          {moments.map((m, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setCursor(geo.at(m.timestamp));
                }}
              >
                <b>{i + 1}</b>
                <span>
                  <strong>{m.title}</strong>
                  <small>{stamp(m.timestamp)}</small>
                  {m.caption}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <aside className="v4-feed">
        <header>
          <span className="v4-live" /> Simulierter Chat
          <small>{visible.length}/{chat.length}</small>
        </header>
        <ol ref={feed}>
          {visible.length ? (
            visible.map((m, i) => (
              <li key={i} className={i === visible.length - 1 ? "v4-new" : undefined}>
                <span className="v4-avatar" style={{ "--h": hue(m.username) } as React.CSSProperties}>
                  {m.username.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <header>
                    <strong>{m.username}</strong>
                    <span className={`v4-pill v4-s-${m.stance}`}>{STANCE[m.stance]}</span>
                    <time>{time(m.timestamp)}</time>
                  </header>
                  <p>{m.text}</p>
                </div>
              </li>
            ))
          ) : (
            <li className="v4-empty">Noch still im Raum. Drück auf Play.</li>
          )}
        </ol>
      </aside>
    </section>
  );
}
