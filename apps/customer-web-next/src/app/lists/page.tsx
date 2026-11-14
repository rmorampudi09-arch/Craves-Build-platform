import MyFoodLists from "@/features/food-lists/screens/MyFoodLists";

export const metadata = {
  title: "Food lists | Craves",
  robots: { index: false, follow: false },
};

export default function FoodListsRoutePage() {
  return <MyFoodLists />;
}
