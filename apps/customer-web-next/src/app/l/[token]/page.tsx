import { notFound } from "next/navigation";
import { isShareToken } from "@/features/food-lists/lib/food-list-contract";
import SharedFoodList from "@/features/food-lists/screens/SharedFoodList";

// A generic title: link previews must not read the list (each read counts a view).
export const metadata = {
  title: "A shared food list | Craves",
  robots: { index: false, follow: false },
};

export default async function SharedFoodListRoutePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();
  return <SharedFoodList token={token} />;
}
