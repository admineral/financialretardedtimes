import { parseArchiveFilter, rangeBounds } from "@/lib/archive/filter";
import { readArchive } from "@/lib/archive/repository";
import { fetchBtcHistory } from "@/lib/archive/prices";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const filter = parseArchiveFilter(new URL(request.url).searchParams);
    const { coverage } = await readArchive(filter);
    const from = filter.from ?? coverage.firstDate,
      to = filter.to ?? coverage.lastDate;
    if (!from || !to) return Response.json(null);
    const { start, end } = rangeBounds(from, to);
    return Response.json(await fetchBtcHistory(start, end));
  } catch (error) {
    return archiveError(error);
  }
}
