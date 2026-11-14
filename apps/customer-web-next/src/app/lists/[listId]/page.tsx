import { notFound } from "next/navigation";
import { isListId } from "@/features/food-lists/lib/food-list-contract";
import FoodListPage from "@/features/food-lists/screens/FoodListPage";

export const metadata = {
  title: "Food list | Craves",
  robots: { index: false, follow: false },
};

export default async function FoodListRoutePage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  if (!isListId(listId)) notFound();
  return <FoodListPage listId={listId} />;
}
