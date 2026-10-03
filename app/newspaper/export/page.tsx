import { Suspense } from "react";
import type { Metadata } from "next";
import { Workspace } from "@/components/archive/Workspace";
import { ExportApp } from "./ExportApp";
export const metadata: Metadata = {
  title: "Archiv & Export · Financial Retarded Times",
  description:
    "Gespeicherte Chatgeschichte mit Bitcoin-Kursen als JSON oder Markdown exportieren.",
};
export default function ExportPage() {
  return (
    <Workspace active="archive">
      <Suspense fallback={<div className="aw-loading">Archiv öffnen …</div>}>
        <ExportApp />
      </Suspense>
    </Workspace>
  );
}
