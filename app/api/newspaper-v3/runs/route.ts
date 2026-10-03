import { after } from "next/server";
import { z } from "zod";
import { CONFIRMATION, replaySchema } from "@/lib/newspaper-v3/schema";
import { prepareReplay } from "@/lib/newspaper-v3/prepare";
import { claimRun, RunLimitError } from "@/lib/newspaper-v3/store";
import { generateReplay } from "@/lib/newspaper-v3/generate";
import { archiveError } from "@/lib/archive/http";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        confirmation: z.literal(CONFIRMATION),
        fingerprint: z.string().length(64),
        input: replaySchema,
      })
      .parse(await request.json());
    if (!process.env.OPENAI_API_KEY)
      return Response.json(
        { error: "OpenAI ist nicht konfiguriert." },
        { status: 503 },
      );
    const prepared = await prepareReplay(body.input);
    if (body.fingerprint !== prepared.fingerprint)
      return Response.json(
        {
          error:
            "Die Quelldaten haben sich geändert. Bitte die Vorschau neu prüfen.",
        },
        { status: 409 },
      );
    if (!prepared.summary.canGenerate)
      return Response.json(
        { error: prepared.summary.problems.join(" ") },
        { status: 422 },
      );
    const id = await claimRun(prepared.summary);
    after(() => generateReplay(id, prepared));
    return Response.json({ id, url: `/newspaper/v3/${id}` }, { status: 202 });
  } catch (error) {
    if (error instanceof RunLimitError)
      return Response.json({ error: error.message }, { status: 429 });
    return archiveError(error);
  }
}
