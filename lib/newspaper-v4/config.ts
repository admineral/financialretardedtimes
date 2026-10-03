import { AI_CONTEXT_LIMIT, AI_MODEL } from "@/lib/ai/model";

// Settings for the AI edition. Change these to give the model more chat history
// (voice days) or a different budget. A year of chat does not fit sensibly into
// one request; 60 days is the hard ceiling the UI and API accept.
export const V4_CONFIG = {
  model: AI_MODEL,
  promptVersion: "frt.ai-edition.v1",
  defaultRoom: "bitcoin_de_DE",
  defaultVoiceDays: 7,
  voiceDayPresets: [3, 7, 14, 30],
  maxVoiceDays: 60,
  defaultHorizon: "7d" as Horizon,
  // A real-chat-free window keeps the edition an honest imagination.
  defaultBlind: true,
  contextLimit: AI_CONTEXT_LIMIT,
  outputReserve: 20_000,
  dailyLimit: 6,
  runMinutes: 5,
} as const;

export const HORIZONS = {
  today: { label: "Heute", long: "Heute bis jetzt", hours: null },
  "3d": { label: "3 Tage", long: "Die letzten 72 Stunden", hours: 72 },
  "7d": { label: "7 Tage", long: "Die letzten sieben Tage", hours: 168 },
} as const;
export type Horizon = keyof typeof HORIZONS;
