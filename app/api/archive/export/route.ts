import { z } from "zod";
import { parseArchiveFilter, rangeBounds } from "@/lib/archive/filter";
import { readArchive } from "@/lib/archive/repository";
import { fetchBtcHistory } from "@/lib/archive/prices";
import {
  jsonExport,
  markdownExport,
  textStream,
} from "@/lib/archive/serialize";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      filter = parseArchiveFilter(params);
    const format = z
      .enum(["json", "markdown"])
      .parse(params.get("format") ?? "json");
    const corpus = await readArchive(filter);
    const from = filter.from ?? corpus.coverage.firstDate,
      to = filter.to ?? corpus.coverage.lastDate;
    const bounds = from && to ? rangeBounds(from, to) : null;
    const btc =
      params.get("btc") !== "false" && bounds
        ? await fetchBtcHistory(bounds.start, bounds.end)
        : null;
    const filename = `frt-${filter.room}-${from ?? "all"}-${to ?? "all"}.${format === "json" ? "json" : "md"}`;
    return new Response(
      textStream(
        format === "json"
          ? jsonExport(corpus, filter, btc)
          : markdownExport(corpus, filter, btc),
      ),
      {
        headers: {
          "Content-Type":
            format === "json"
              ? "application/json; charset=utf-8"
              : "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      },
    );
  } catch (error) {
    return archiveError(error);
  }
}
