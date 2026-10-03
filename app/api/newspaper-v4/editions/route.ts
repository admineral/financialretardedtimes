import { after } from "next/server";
import { z } from "zod";
import { editionInputSchema } from "@/lib/newspaper-v4/schema";
import { prepareEdition } from "@/lib/newspaper-v4/prepare";
import { claimEdition, EditionLimitError } from "@/lib/newspaper-v4/store";
import { generateEdition } from "@/lib/newspaper-v4/generate";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const body = z
      .object({ input: editionInputSchema, confirmed: z.literal(true) })
      .parse(await request.json());
    if (!process.env.OPENAI_API_KEY)
      return Response.json(
        { error: "OpenAI ist nicht konfiguriert." },
        { status: 503 },
      );
    // Prices move every hour, so the edition is always built from fresh data.
    const prepared = await prepareEdition(body.input);
    if (!prepared.summary.canGenerate)
      return Response.json(
        { error: prepared.summary.problems.join(" ") },
        { status: 422 },
      );
    const id = await claimEdition(prepared.summary);
    after(() => generateEdition(id, prepared));
    return Response.json({ id, url: `/newspaper/v4/${id}` }, { status: 202 });
  } catch (error) {
    if (error instanceof EditionLimitError)
      return Response.json({ error: error.message }, { status: 429 });
    return archiveError(error);
  }
}
