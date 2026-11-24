import { Suspense } from "react";
import type { Metadata } from "next";
import { UploadView } from "@/components/upload/UploadView";
import UploadLoading from "./loading";

export const metadata: Metadata = { title: "Upload audio · Saydraft" };

export default function UploadPage() {
  return (
    <Suspense fallback={<UploadLoading />}>
      <UploadView />
    </Suspense>
  );
}
