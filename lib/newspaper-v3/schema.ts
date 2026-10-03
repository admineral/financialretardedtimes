import { z } from "zod";
import { dateKeySchema } from "@/lib/archive/filter";
import {
  addDaysToDateKey,
  getNewspaperDateKey,
} from "@/app/newspaper/lib/timezone";
import { AI_CONTEXT_LIMIT, AI_MODEL } from "@/lib/ai/model";
export const MODEL = AI_MODEL;
export const PROMPT_VERSION = "frt.replay.v1";
export const CONTEXT_LIMIT = AI_CONTEXT_LIMIT;
export const OUTPUT_RESERVE = 24_000;
export const CONFIRMATION = "yes generate new";
export const DAILY_LIMIT = 3;
export const replaySchema = z
  .object({
    room: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,80}$/)
      .default("bitcoin_de_DE"),
    trainingFrom: dateKeySchema,
    cutoff: dateKeySchema,
  })
  .refine(
    (value) => value.trainingFrom <= value.cutoff,
    "Trainingsbeginn muss vor dem Stichtag liegen.",
  )
  .refine(
    (value) => addDaysToDateKey(value.cutoff, 7) < getNewspaperDateKey(),
    "Die sieben Replay-Tage müssen vollständig in der Vergangenheit liegen.",
  );
export type ReplayInput = z.infer<typeof replaySchema>;
export function defaultReplay(now = new Date()): ReplayInput {
  const cutoff = addDaysToDateKey(getNewspaperDateKey(now), -8);
  return {
    room: "bitcoin_de_DE",
    cutoff,
    trainingFrom: addDaysToDateKey(cutoff, -29),
  };
}
const reference = z.string().min(1);
export const issueSchema = z.object({
  headline: z.string().min(1).max(180),
  deck: z.string().max(700),
  articles: z
    .array(
      z.object({
        title: z.string().max(180),
        body: z.string().max(4000),
        sourceIds: z.array(reference).max(6),
      }),
    )
    .min(1)
    .max(4),
  chat: z
    .array(
      z.object({
        username: z.string(),
        timestamp: z.iso.datetime(),
        text: z.string().max(1200),
        sourceIds: z.array(reference).min(1).max(4),
      }),
    )
    .min(1)
    .max(42),
  participants: z
    .array(
      z.object({
        username: z.string(),
        reason: z.string().max(1000),
        sourceIds: z.array(reference).min(1).max(4),
      }),
    )
    .min(1)
    .max(12),
});
export type ReplayIssue = z.infer<typeof issueSchema>;
