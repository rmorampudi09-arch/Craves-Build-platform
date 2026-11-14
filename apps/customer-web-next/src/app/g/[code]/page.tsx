import { notFound } from "next/navigation";
import { joinCodeFrom } from "@/features/group-orders/lib/group-order-contract";
import JoinGroupOrder from "@/features/group-orders/screens/JoinGroupOrder";

// A generic title: link previews must not read the group.
export const metadata = {
  title: "Join a group order | Craves",
  robots: { index: false, follow: false },
};

export default async function JoinGroupOrderRoutePage({ params }: { params: Promise<{ code: string }> }) {
  const code = joinCodeFrom((await params).code);
  if (!code) notFound();
  return <JoinGroupOrder code={code} />;
}
