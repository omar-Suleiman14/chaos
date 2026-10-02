import { Suspense } from "react";
import CreatorLibrary from "@/components/library/CreatorLibrary";

/** The library reads its tab from the address, which needs a Suspense boundary. */
export default function LibraryPage() {
  return <Suspense fallback={null}><CreatorLibrary /></Suspense>;
}
