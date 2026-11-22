import { Suspense } from "react";
import type { Metadata } from "next";
import { RecorderView } from "@/components/record/RecorderView";

export const metadata: Metadata = { title: "Record · Saydraft" };

export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecorderView />
    </Suspense>
  );
}
