import { notFound, redirect } from "next/navigation";

// Legacy public chef links carried a kitchen id; any other segment is not a page.
const KITCHEN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LegacyChefProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!KITCHEN_ID.test(id)) notFound();
  redirect(`/kitchen/${encodeURIComponent(id)}`);
}
