import ConsentForm from "@/components/auth/ConsentForm";
import { notFound } from "next/navigation";
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "betterauth") notFound();
  const params = await searchParams;
  return (
    <ConsentForm
      clientId={typeof params.client_id === "string" ? params.client_id : ""}
      scopes={typeof params.scope === "string" ? params.scope : ""}
    />
  );
}
