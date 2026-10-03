import { z } from "zod";
import { parseArchiveFilter } from "@/lib/archive/filter";
import { readArchive } from "@/lib/archive/repository";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      filter = parseArchiveFilter(params);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(params.get("limit") ?? 50);
    const corpus = await readArchive(filter);
    if (params.get("snapshot") && params.get("snapshot") !== corpus.fingerprint)
      return Response.json(
        {
          error: "Das Archiv hat sich geändert. Bitte die Vorschau neu laden.",
        },
        { status: 409 },
      );
    const cursor = params.get("cursor"),
      index = cursor
        ? corpus.messages.findIndex((message) => message.id === cursor)
        : -1;
    if (cursor && index < 0)
      return Response.json(
        { error: "Ungültiger Cursor. Bitte neu laden." },
        { status: 400 },
      );
    const messages = corpus.messages.slice(index + 1, index + 1 + limit);
    return Response.json({
      messages,
      total: corpus.messages.length,
      fingerprint: corpus.fingerprint,
      nextCursor:
        index + 1 + limit < corpus.messages.length ? messages.at(-1)?.id : null,
    });
  } catch (error) {
    return archiveError(error);
  }
}
