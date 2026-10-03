import { z } from "zod";
import { getEdition } from "@/lib/newspaper-v4/store";
import { archiveError } from "@/lib/archive/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
        .uuid()
        .parse((await params).id),
      edition = await getEdition(id);
    return edition
      ? Response.json(
          { status: edition.status, error: edition.error },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return archiveError(error);
  }
}
