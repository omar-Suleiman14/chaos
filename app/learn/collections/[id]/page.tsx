import type { Metadata } from "next";
import CollectionView from "./CollectionView";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Collection", robots: { index: false, follow: true } };

export default async function CollectionPage({ params }: Props) {
  const { id } = await params;
  return <CollectionView id={id} />;
}
