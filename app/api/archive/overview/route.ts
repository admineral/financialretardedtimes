import { parseArchiveFilter } from "@/lib/archive/filter";
import {
  readArchive,
  readInventory,
  storedRooms,
} from "@/lib/archive/repository";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const filter = parseArchiveFilter(new URL(request.url).searchParams);
    const [rooms, room] = await Promise.all([
      storedRooms(),
      readInventory(filter.room),
    ]);
    const selected =
      filter.from || filter.to || filter.username
        ? await readArchive(filter)
        : room;
    return Response.json({
      rooms,
      filter,
      available: room.coverage,
      selected: selected.coverage,
      fingerprint: selected.fingerprint,
      readAt: selected.readAt,
    });
  } catch (error) {
    return archiveError(error);
  }
}
