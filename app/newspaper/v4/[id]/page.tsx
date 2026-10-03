import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EditionLoader } from "../EditionLoader";
import { Shell } from "../Shell";

async function Edition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <EditionLoader id={id} />;
}

export default function EditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Shell>
      <Suspense fallback={<div className="v4-pending"><p>Ausgabe wird geladen …</p></div>}>
        <Edition params={params} />
      </Suspense>
    </Shell>
  );
}
