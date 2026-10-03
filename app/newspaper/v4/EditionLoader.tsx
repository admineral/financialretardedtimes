import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition } from "@/lib/newspaper-v4/store";
import type { EditionOutput } from "@/lib/newspaper-v4/generate";
import type { EditionPreview } from "@/lib/newspaper-v4/prepare";
import { EditionView } from "./EditionView";
import { Pending } from "./Pending";

export async function EditionLoader({ id }: { id: string }) {
  let edition;
  try {
    edition = await getEdition(id);
  } catch {
    return <p className="v4-error">Die Ausgabe ist momentan nicht erreichbar. Bitte neu laden.</p>;
  }
  if (!edition) notFound();
  if (edition.status === "running") return <Pending id={id} />;
  if (edition.status === "failed")
    return (
      <div className="v4-pending">
        <h2>Diese Ausgabe ging nicht in Druck.</h2>
        <p>{edition.error}</p>
        <Link className="v4-btn" href="/newspaper/v4">Zurück zur Redaktion</Link>
      </div>
    );
  const summary = edition.input_data as EditionPreview;
  return (
    <EditionView
      output={edition.output_data as EditionOutput}
      meta={{
        number: edition.number,
        createdAt: new Date(edition.created_at).toISOString(),
        horizon: summary.input.horizon,
        start: summary.start,
        end: summary.end,
        voiceFrom: summary.voiceFrom,
        voiceTo: summary.voiceTo,
        messageCount: summary.messageCount,
        model: edition.model,
      }}
    />
  );
}
