import { prepareEdition } from "@/lib/newspaper-v4/prepare";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    return Response.json((await prepareEdition(await request.json())).summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return archiveError(error);
  }
}
