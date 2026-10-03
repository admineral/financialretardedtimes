import { z } from "zod";
import { getRun } from "@/lib/newspaper-v3/store";
import { archiveError } from "@/lib/archive/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
        .uuid()
        .parse((await params).id),
      run = await getRun(id);
    return run
      ? Response.json(
          { status: run.status, error: run.error },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return archiveError(error);
  }
}
