import { z } from "zod";
import { HORIZONS, V4_CONFIG, type Horizon } from "./config";

export const editionInputSchema = z.object({
  room: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,80}$/)
    .default(V4_CONFIG.defaultRoom),
  horizon: z
    .enum(Object.keys(HORIZONS) as [Horizon, ...Horizon[]])
    .default(V4_CONFIG.defaultHorizon),
  voiceDays: z
    .number()
    .int()
    .min(1)
    .max(V4_CONFIG.maxVoiceDays)
    .default(V4_CONFIG.defaultVoiceDays),
  blind: z.boolean().default(V4_CONFIG.defaultBlind),
});
export type EditionInput = z.infer<typeof editionInputSchema>;
export const defaultEditionInput = (): EditionInput =>
  editionInputSchema.parse({});

const stance = z.enum(["bull", "bear", "neutral", "meme"]);
export const SECTIONS = [
  "Markt",
  "Chat",
  "Meinung",
  "Gerüchte",
  "Feuilleton",
] as const;
export const issueSchema = z.object({
  kicker: z.string().max(60),
  headline: z.string().min(1).max(160),
  deck: z.string().max(500),
  mood: z.object({
    score: z.number().int().min(-100).max(100),
    label: z.string().max(40),
    explanation: z.string().max(400),
  }),
  lead: z.object({
    title: z.string().max(160),
    body: z.string().max(3500),
    pullQuote: z.object({
      username: z.string(),
      text: z.string().max(280),
    }),
  }),
  articles: z
    .array(
      z.object({
        section: z.enum(SECTIONS),
        title: z.string().max(160),
        body: z.string().max(2200),
        author: z.string().max(80),
      }),
    )
    .min(3)
    .max(6),
  moments: z
    .array(
      z.object({
        timestamp: z.iso.datetime(),
        title: z.string().max(80),
        caption: z.string().max(300),
      }),
    )
    .min(2)
    .max(8),
  chat: z
    .array(
      z.object({
        username: z.string(),
        timestamp: z.iso.datetime(),
        text: z.string().max(500),
        stance,
      }),
    )
    .min(12)
    .max(60),
  cast: z
    .array(
      z.object({
        username: z.string(),
        role: z.string().max(60),
        bio: z.string().max(300),
        stance,
        sourceIds: z.array(z.string()).max(3),
      }),
    )
    .min(2)
    .max(8),
  predictions: z
    .array(
      z.object({
        username: z.string(),
        call: z.string().max(200),
        target: z.number().nullable(),
      }),
    )
    .max(6),
  briefs: z.array(z.string().max(220)).max(6),
  ticker: z.array(z.string().max(120)).min(3).max(10),
});
export type Issue = z.infer<typeof issueSchema>;
export type Stance = z.infer<typeof stance>;
