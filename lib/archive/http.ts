import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
export function archiveError(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  console.error(
    "[archive]",
    error instanceof Error ? error.message : "Unknown failure",
  );
  return Response.json(
    {
      error:
        "Das Archiv konnte nicht vollständig gelesen werden. Bitte erneut versuchen.",
    },
    { status: 503 },
  );
}
