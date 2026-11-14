import { notFound } from "next/navigation";
import { isGroupId } from "@/features/group-orders/lib/group-order-contract";
import GroupOrderPage from "@/features/group-orders/screens/GroupOrderPage";

export const metadata = {
  title: "Group order | Craves",
  robots: { index: false, follow: false },
};

export default async function GroupOrderRoutePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!isGroupId(groupId)) notFound();
  return <GroupOrderPage groupId={groupId} />;
}
