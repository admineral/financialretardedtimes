import { z } from "zod";
import {
  addDaysToDateKey,
  getNewspaperDayBounds,
} from "@/app/newspaper/lib/timezone";
import type { ArchiveFilter, ArchiveMessage } from "./types";

export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Invalid date");

export const archiveFilterSchema = z
  .object({
    room: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,80}$/)
      .default("bitcoin_de_DE"),
    username: z.string().trim().min(1).max(100).optional(),
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "Start date must precede end date",
  );

export function parseArchiveFilter(params: URLSearchParams): ArchiveFilter {
  return archiveFilterSchema.parse(
    Object.fromEntries(
      ["room", "username", "from", "to"].flatMap((key) => {
        const value = params.get(key);
        return value ? [[key, value]] : [];
      }),
    ),
  );
}

export function matchesFilter(
  message: ArchiveMessage,
  filter: ArchiveFilter,
): boolean {
  if (
    message.room !== filter.room ||
    (filter.username && message.username !== filter.username)
  )
    return false;
  if ((filter.from || filter.to) && !message.date) return false;
  return (
    (!filter.from || message.date! >= filter.from) &&
    (!filter.to || message.date! <= filter.to)
  );
}

export function rangeBounds(from: string, to: string) {
  return {
    start: getNewspaperDayBounds(from).startDate,
    end: getNewspaperDayBounds(addDaysToDateKey(to, 1)).startDate,
  };
}
