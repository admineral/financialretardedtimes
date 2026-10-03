import type { ArchiveCorpus, ArchiveFilter, BtcHistory } from "./types";
import { priceReference } from "./prices";
export function exportMetadata(
  corpus: ArchiveCorpus,
  filter: ArchiveFilter,
  btc: BtcHistory | null,
) {
  return {
    schemaVersion: "frt.archive.v1",
    exportedAt: new Date().toISOString(),
    snapshotReadAt: corpus.readAt,
    fingerprint: corpus.fingerprint,
    filter,
    timezone: "Europe/Berlin",
    timestamps: "UTC ISO 8601",
    coverage: corpus.coverage,
    participants: corpus.coverage.participants,
    btc: btc ? { ...btc, candles: undefined } : null,
  };
}
export function* jsonExport(
  corpus: ArchiveCorpus,
  filter: ArchiveFilter,
  btc: BtcHistory | null,
): Generator<string> {
  const metadata = JSON.stringify(exportMetadata(corpus, filter, btc), null, 2);
  yield `${metadata.slice(0, -1)},\n"messages": [\n`;
  for (let i = 0; i < corpus.messages.length; i++) {
    const message = corpus.messages[i];
    yield `${i ? ",\n" : ""}${JSON.stringify({ ...message, btc: priceReference(btc?.candles ?? [], message.timestamp) })}`;
  }
  yield '\n],\n"candles": [\n';
  for (let i = 0; i < (btc?.candles.length ?? 0); i++)
    yield `${i ? ",\n" : ""}${JSON.stringify(btc!.candles[i])}`;
  yield "\n]\n}\n";
}
export function* markdownExport(
  corpus: ArchiveCorpus,
  filter: ArchiveFilter,
  btc: BtcHistory | null,
): Generator<string> {
  yield `# Financial Retarded Times — Chat archive\n\nRoom: ${filter.room}\nRange: ${filter.from ?? corpus.coverage.firstDate ?? "unknown"} — ${filter.to ?? corpus.coverage.lastDate ?? "unknown"}\nMessages: ${corpus.messages.length}\nSnapshot: ${corpus.readAt}\nFingerprint: ${corpus.fingerprint}\n\n`;
  yield "> Original saved conversation. Times are UTC; day headings use Europe/Berlin. BTC references are the latest completed hourly BTC/USDT candle, not exact trade prices.\n\n";
  for (const note of [...corpus.coverage.notes, ...(btc?.notes ?? [])])
    yield `- ${note}\n`;
  let date: string | null | undefined;
  for (const message of corpus.messages) {
    if (message.date !== date) {
      date = message.date;
      yield `\n## ${date ?? "Unknown date"}\n\n`;
    }
    const price = priceReference(btc?.candles ?? [], message.timestamp);
    yield `### ${message.username.replace(/[\r\n]/g, " ")} · ${message.timestamp ?? "unknown time"}\n\nID: ${message.id}\n${btc ? `BTC reference: ${price ? `${price.price} USDT (as of ${price.asOf})` : "unavailable"}\n` : ""}\n`;
    yield `${message.text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n\n`;
  }
  if (btc?.candles.length) {
    yield "\n## BTC/USDT hourly candles\n\nUTC open | Open | High | Low | Close\n--- | ---: | ---: | ---: | ---:\n";
    for (const c of btc.candles)
      yield `${c.openTime} | ${c.open} | ${c.high} | ${c.low} | ${c.close}\n`;
  }
}
export function textStream(
  parts: Iterable<string>,
): ReadableStream<Uint8Array> {
  const iterator = parts[Symbol.iterator](),
    encoder = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      let chunk = "";
      while (chunk.length < 64 * 1024) {
        const next = iterator.next();
        if (next.done) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
          controller.close();
          return;
        }
        chunk += next.value;
      }
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      iterator.return?.();
    },
  });
}
