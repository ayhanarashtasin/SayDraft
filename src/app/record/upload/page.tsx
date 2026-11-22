import { Suspense } from "react";
import type { Metadata } from "next";
import { UploadView } from "@/components/upload/UploadView";

export const metadata: Metadata = { title: "Upload audio · Saydraft" };

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadView />
    </Suspense>
  );
}
