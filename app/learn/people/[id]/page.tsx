import type { Metadata } from "next";
import ProfileView from "@/components/learn/ProfileView";

type Props = { params: Promise<{ id: string }> };

// Profiles are only indexable once the Learn backend can render them on the server.
export const metadata: Metadata = { title: "Contributor", robots: { index: false, follow: true } };

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  return <ProfileView id={decodeURIComponent(id)} />;
}
