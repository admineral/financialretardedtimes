import type { BtcCandle, BtcHistory } from "./types";
const HOUR = 3_600_000;
export function priceReference(candles: BtcCandle[], timestamp: string | null) {
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  let low = 0,
    high = candles.length - 1,
    match: BtcCandle | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2),
      candle = candles[middle];
    if (Date.parse(candle.closeTime) <= time) {
      match = candle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return match && time - Date.parse(match.closeTime) <= HOUR
    ? {
        candleId: match.id,
        price: match.close,
        currency: "USDT" as const,
        asOf: match.closeTime,
        method: "latest-completed-hour" as const,
      }
    : null;
}
export async function fetchBtcHistory(
  start: Date,
  end: Date,
  fetcher: typeof fetch = fetch,
): Promise<BtcHistory> {
  const from = Math.floor(start.getTime() / HOUR) * HOUR - HOUR;
  const until = Math.min(end.getTime(), Math.floor(Date.now() / HOUR) * HOUR);
  const candles = new Map<number, BtcCandle>(),
    notes: string[] = [];
  for (let cursor = from; cursor < until;) {
    let raw: unknown = null;
    for (const host of [
      "api.binance.com",
      "api1.binance.com",
      "api2.binance.com",
    ]) {
      try {
        const params = new URLSearchParams({
          symbol: "BTCUSDT",
          interval: "1h",
          startTime: String(cursor),
          endTime: String(until - 1),
          limit: "1000",
        });
        const response = await fetcher(
          `https://${host}/api/v3/klines?${params}`,
          { signal: AbortSignal.timeout(12_000), next: { revalidate: 3600 } },
        );
        if (!response.ok) continue;
        raw = await response.json();
        if (Array.isArray(raw)) break;
      } catch {
        /* Try the next mirror; never invent prices. */
      }
    }
    if (!Array.isArray(raw)) {
      notes.push("BTC provider unavailable for part of the selected range.");
      break;
    }
    if (!raw.length) break;
    let last = cursor - HOUR;
    for (const row of raw) {
      if (!Array.isArray(row) || row.length < 7)
        throw new Error("Invalid BTC candle response");
      const values = row.slice(0, 7).map(Number);
      if (values.some((value) => !Number.isFinite(value)))
        throw new Error("Invalid BTC price value");
      const [time, open, high, low, close, volume, closeTime] = values;
      last = Math.max(last, time);
      if (time < from || closeTime >= until) continue;
      candles.set(time, {
        id: `binance:BTCUSDT:1h:${time}`,
        openTime: new Date(time).toISOString(),
        closeTime: new Date(closeTime).toISOString(),
        open,
        high,
        low,
        close,
        volume,
      });
    }
    if (last < cursor) throw new Error("BTC pagination did not advance");
    cursor = last + HOUR;
    if (raw.length < 1000) break;
  }
  const ordered = [...candles]
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
  const missingHours = Math.max(
    0,
    Math.floor((until - from) / HOUR) - ordered.length,
  );
  if (missingHours)
    notes.push(
      `${missingHours} hourly candles unavailable; missing price references are null.`,
    );
  return {
    source: "Binance",
    symbol: "BTCUSDT",
    quoteCurrency: "USDT",
    interval: "1h",
    candles: ordered,
    missingHours,
    notes,
  };
}
