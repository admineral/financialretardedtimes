import "server-only";
import { archiveDatabase } from "@/lib/archive/database";
import { readArchive } from "@/lib/archive/repository";
import { rangeBounds } from "@/lib/archive/filter";
import { fetchBtcHistory } from "@/lib/archive/prices";
import { getNewspaperDateKey } from "@/app/newspaper/lib/timezone";
import { estimateCostUSD } from "@/lib/ai/model";
import { V4_CONFIG } from "./config";
import { editionWindow } from "./window";
import { buildEditionPrompt } from "./prompt";
import { editionInputSchema } from "./schema";

async function lastChatDay(room: string) {
  const [row] =
    await archiveDatabase()`SELECT max(time) AS last FROM tv_chat_messages WHERE room_id = ${room}`;
  return row?.last
    ? getNewspaperDateKey(new Date(row.last))
    : getNewspaperDateKey();
}

export async function prepareEdition(raw: unknown) {
  const input = editionInputSchema.parse(raw);
  const window = editionWindow(input, await lastChatDay(input.room));
  const corpus = await readArchive({
    room: input.room,
    from: window.voiceFrom,
    to: window.voiceTo,
  });
  const contextStart = rangeBounds(window.voiceFrom, window.voiceTo).start;
  const btc = await fetchBtcHistory(contextStart, new Date(window.end));
  const startMs = Date.parse(window.start);
  const context = btc.candles.filter((c) => Date.parse(c.openTime) < startMs),
    horizon = btc.candles.filter((c) => Date.parse(c.openTime) >= startMs);
  const built = buildEditionPrompt(input, window, corpus, context, horizon);
  const cost = estimateCostUSD(built.inputTokens, V4_CONFIG.outputReserve);
  const problems = [
    ...(corpus.messages.length < 20
      ? ["Zu wenige Chatnachrichten im Stilzeitraum. Bitte mehr Tage wählen."]
      : []),
    ...(horizon.length < 2
      ? ["Noch zu wenige BTC-Kerzen im Ausgabezeitraum. Bitte später erneut versuchen."]
      : []),
    ...(!built.fits
      ? ["Der Stilzeitraum ist zu groß für das Kontextfenster. Bitte weniger Tage wählen."]
      : []),
  ];
  return {
    input,
    corpus,
    horizon,
    ...built,
    summary: {
      input,
      ...window,
      model: V4_CONFIG.model,
      messageCount: corpus.messages.length,
      participantCount: corpus.coverage.participantCount,
      topVoices: corpus.coverage.participants.slice(0, 6),
      candleCount: horizon.length,
      lastPrice: horizon.at(-1)?.close ?? null,
      fingerprint: built.fingerprint,
      inputTokens: built.inputTokens,
      canGenerate: problems.length === 0,
      problems,
      estimatedUSD: cost.inputUSD + cost.outputUSD,
    },
  };
}
export type EditionPreview = Awaited<
  ReturnType<typeof prepareEdition>
>["summary"];
