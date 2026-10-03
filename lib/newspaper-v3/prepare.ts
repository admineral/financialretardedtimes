import "server-only";
import { readArchive } from "@/lib/archive/repository";
import { rangeBounds } from "@/lib/archive/filter";
import { fetchBtcHistory } from "@/lib/archive/prices";
import { addDaysToDateKey } from "@/app/newspaper/lib/timezone";
import { estimateCostUSD } from "@/lib/ai/model";
import { buildReplayPrompt } from "./prompt";
import {
  replaySchema,
  MODEL,
  CONTEXT_LIMIT,
  OUTPUT_RESERVE,
  type ReplayInput,
} from "./schema";
export async function prepareReplay(raw: ReplayInput) {
  const input = replaySchema.parse(raw);
  const corpus = await readArchive({
    room: input.room,
    from: input.trainingFrom,
    to: input.cutoff,
  });
  const { start, end } = rangeBounds(
    input.trainingFrom,
    addDaysToDateKey(input.cutoff, 7),
  );
  const btc = await fetchBtcHistory(start, end);
  const built = buildReplayPrompt(input, corpus, btc);
  const cost = estimateCostUSD(built.inputTokens, OUTPUT_RESERVE);
  const replayStart = rangeBounds(
    built.replayFrom,
    built.replayTo,
  ).start.getTime();
  const replayHours = (end.getTime() - replayStart) / 3_600_000;
  const actualReplayHours = btc.candles.filter(
    (c) =>
      Date.parse(c.openTime) >= replayStart &&
      Date.parse(c.closeTime) < end.getTime(),
  ).length;
  const problems = [
    ...(!corpus.messages.length
      ? ["Keine gespeicherten Nachrichten im Trainingszeitraum."]
      : []),
    ...(!built.fits
      ? [
          "Der vollständige Text überschreitet das Kontextfenster. Bitte einen kürzeren Zeitraum wählen.",
        ]
      : []),
    ...(actualReplayHours < replayHours
      ? [
          "BTC-Kerzen für die Replay-Woche sind unvollständig. Bitte erneut laden oder eine andere Woche wählen.",
        ]
      : []),
  ];
  return {
    input,
    corpus,
    btc,
    ...built,
    summary: {
      input,
      replayFrom: built.replayFrom,
      replayTo: built.replayTo,
      model: MODEL,
      coverage: corpus.coverage,
      fingerprint: built.fingerprint,
      inputTokens: built.inputTokens,
      contextLimit: CONTEXT_LIMIT,
      outputReserve: OUTPUT_RESERVE,
      canGenerate: problems.length === 0,
      problems,
      estimatedInputUSD: cost.inputUSD,
      maxOutputUSD: cost.outputUSD,
    },
  };
}
export type ReplayPreview = Awaited<
  ReturnType<typeof prepareReplay>
>["summary"];
