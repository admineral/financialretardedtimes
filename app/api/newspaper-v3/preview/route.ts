import { prepareReplay } from "@/lib/newspaper-v3/prepare";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    return Response.json((await prepareReplay(await request.json())).summary);
  } catch (error) {
    return archiveError(error);
  }
}
