import AllChefsPage from "@/features/chefs/screens/AllChefs";

export const metadata = {
  title: "Home kitchens near you | Craves",
  description: "Discover verified home kitchens cooking fresh homemade food near you in Hyderabad and Bangalore. See their menus, ratings and reviews on Craves.",
  robots: { index: true, follow: true },
};

export default function ChefsRoutePage() {
  return <AllChefsPage />;
}
