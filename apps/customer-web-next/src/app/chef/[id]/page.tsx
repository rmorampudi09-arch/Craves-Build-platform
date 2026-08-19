import { redirect } from "next/navigation";

export default async function LegacyChefProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/kitchen/${encodeURIComponent(id)}`);
}
